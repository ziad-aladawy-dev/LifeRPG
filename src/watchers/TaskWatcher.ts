// ============================================================================
// Life RPG — Task Watcher
// Detects checkbox toggles in markdown files via Obsidian's metadataCache.
// Integrates with Daily Notes / Calendar plugin by monitoring the daily
// notes folder for task completions.
// ============================================================================

import { type App, type TFile, type TAbstractFile, Notice, debounce } from "obsidian";
import { StateManager } from "../state/StateManager";
import { type TrackedTask, type PluginSettings } from "../types";
import {
	parseTaskMetadata,
	isTaskLine,
	isTaskCompleted,
	getTaskText,
} from "../utils/parser";
import { processTaskCompletion, processTaskUncompletion } from "../engine/GameEngine";
import {
	playerAttacksBoss,
	healBoss,
	advanceDungeonProgress,
	revertDungeonProgress,
} from "../engine/BossEngine";
import { processXpGain, processGpGain, processHpDamage } from "../engine/GameEngine";
import { generateId } from "../constants";
import { getTodayStr } from "../utils/dateUtils";

export class TaskWatcher {
	private app: App;
	private stateManager: StateManager;
	private unregisterEvents: (() => void)[] = [];

	/**
	 * In-memory task cache: maps file paths to their last-seen task states.
	 * NOT persisted — rebuilt on startup by scanning relevant files.
	 */
	private taskCache: Map<string, TrackedTask[]> = new Map();
	private initialized = false;

	constructor(app: App, stateManager: StateManager) {
		this.app = app;
		this.stateManager = stateManager;
	}

	// -------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------

	/** Start listening for file changes and perform initial scan */
	start(): void {
		// 1. Listen to metadataCache changes (fires when any .md file is modified)
		const changeHandler = debounce(
			(file: TFile) => this.onFileChanged(file),
			400,
			true
		);
		const changeRef = this.app.metadataCache.on("changed", changeHandler);
		this.unregisterEvents.push(() =>
			this.app.metadataCache.offref(changeRef)
		);

		// 2. Listen to file deletions to clean up cache
		const deleteHandler = (file: TAbstractFile) => {
			this.taskCache.delete(file.path);
		};
		const deleteRef = this.app.vault.on("delete", deleteHandler);
		this.unregisterEvents.push(() =>
			this.app.vault.offref(deleteRef)
		);

		// 3. Listen to file renames to update cache keys
		const renameHandler = (file: TAbstractFile, oldPath: string) => {
			const cached = this.taskCache.get(oldPath);
			if (cached) {
				this.taskCache.delete(oldPath);
				this.taskCache.set(file.path, cached);
			}
		};
		const renameRef = this.app.vault.on("rename", renameHandler);
		this.unregisterEvents.push(() =>
			this.app.vault.offref(renameRef)
		);

		// 4. Initial scan — build the cache from existing files
		//    Use a short delay to let Obsidian finish loading
		setTimeout(() => this.performInitialScan(), 2000);
	}

	/** Stop listening for file changes */
	stop(): void {
		for (const unsub of this.unregisterEvents) {
			unsub();
		}
		this.unregisterEvents = [];
		this.taskCache.clear();
		this.initialized = false;
	}

	// -------------------------------------------------------------------
	// Initial Scan — build task cache from existing files
	// -------------------------------------------------------------------

	/**
	 * Scan all relevant markdown files and build the initial task cache.
	 * This runs once on startup so we don't award XP for pre-existing
	 * completed tasks, but DO detect future toggles.
	 */
	private async performInitialScan(): Promise<void> {
		const settings = this.stateManager.getSettings();
		if (!settings.enableTaskWatcher) return;

		const files = this.getRelevantFiles(settings);
		let scanned = 0;

		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const tasks = this.parseTasksFromContent(content, file.path);
				this.taskCache.set(file.path, tasks);
				scanned++;
			} catch {
				// File may have been deleted during scan
			}
		}

		this.initialized = true;
		console.log(
			`Life RPG: Initial scan complete — cached ${scanned} files, ` +
				`${Array.from(this.taskCache.values()).reduce((sum, t) => sum + t.length, 0)} tasks tracked.`
		);

		// Now that cache is mapped, penalize overdue tasks if necessary
		this.processOverdueTasks(settings);
	}

	/**
	 * Checks all active tasks for missed deadlines and deals recurring damage
	 * once per day.
	 */
	private async processOverdueTasks(settings: PluginSettings): Promise<void> {
		const state = this.stateManager.getState();
		const today = getTodayStr();

		if (state.lastOverdueCheckDate === today) return;

		// Immediately mark as checked to prevent re-entrant calls from state change listeners
		this.stateManager.updateLastOverdueCheckDate(today);

		let char = this.stateManager.getCharacter();
		const boss = this.stateManager.getActiveBoss();
		const activeTasks = this.getActiveTasks();
		
		let damageDealt = 0;
		let overdueCount = 0;
		const logEntries: any[] = [];
		let died = false;

		for (const task of activeTasks) {
			const meta = parseTaskMetadata(task.text);
			if (meta.deadline && meta.deadline < today) {
				overdueCount++;
				// If boss is active, take specific boss damage. Else take flat 5 damage.
				const dmg = (settings.bossEnabled && boss) ? settings.bossDamageOnMissedDeadline : 5;
				damageDealt += dmg;
			}
		}

		if (overdueCount > 0) {
			const hpResult = processHpDamage(char, damageDealt);
			char = hpResult.character;
			died = hpResult.died;

			// Add the aggregated damage notification
			const dmgSource = (settings.bossEnabled && boss) ? `${boss.name} attacked you` : "You took damage";
			logEntries.push({
				id: generateId(),
				timestamp: new Date().toISOString(),
				type: "boss-damage-taken",
				message: `🚨 OVERDUE: ${dmgSource} for ${damageDealt} HP because of ${overdueCount} missed deadline(s)!`,
				xpDelta: 0,
				gpDelta: 0,
				hpDelta: -damageDealt,
			});

			// If death happened, push the death log
			if (died) {
				logEntries.push(...hpResult.logEntries);
			}

			// Apply to state
			this.stateManager.updateCharacter(char);
			logEntries.forEach(log => this.stateManager.addLogEntry(log));
		}
	}

	/**
	 * Get all currently tracked active (unchecked) tasks.
	 */
	getActiveTasks(): TrackedTask[] {
		const result: TrackedTask[] = [];
		for (const [_, tasks] of this.taskCache.entries()) {
			for (const task of tasks) {
				if (!task.completed) {
					result.push(task);
				}
			}
		}
		return result;
	}

	/**
	 * Get the list of markdown files to monitor.
	 * If a daily notes folder is set, prioritize that.
	 * If scanAllFiles is true, scan everything.
	 */
	private getRelevantFiles(settings: PluginSettings): TFile[] {
		const allFiles = this.app.vault.getMarkdownFiles();

		if (settings.scanAllFiles) {
			return allFiles;
		}

		// If not scanning all, only scan daily notes folder
		const dailyFolder = this.getDailyNotesFolder(settings);
		if (dailyFolder) {
			return allFiles.filter((f) => f.path.startsWith(dailyFolder));
		}

		return allFiles;
	}

	/**
	 * Detect the daily notes folder.
	 * Priority:
	 *   1. User-configured folder in plugin settings
	 *   2. Daily Notes core plugin config
	 *   3. Calendar plugin config
	 *   4. Fallback: root
	 */
	private getDailyNotesFolder(settings: PluginSettings): string {
		// 1. User-configured
		if (settings.dailyNotesFolder) {
			return settings.dailyNotesFolder;
		}

		// 2. Try the Daily Notes core plugin config
		try {
			const dailyNotesConfig = (this.app as any).internalPlugins?.plugins?.[
				"daily-notes"
			]?.instance?.options;
			if (dailyNotesConfig?.folder) {
				return dailyNotesConfig.folder;
			}
		} catch {
			// ignore
		}

		// 3. Try the Periodic Notes community plugin
		try {
			const periodicNotes = (this.app as any).plugins?.plugins?.[
				"periodic-notes"
			];
			if (periodicNotes?.settings?.daily?.folder) {
				return periodicNotes.settings.daily.folder;
			}
		} catch {
			// ignore
		}

		return "";
	}

	// -------------------------------------------------------------------
	// File Change Handling
	// -------------------------------------------------------------------

	/** Handle a file change — detect newly completed tasks */
	private async onFileChanged(file: TFile): Promise<void> {
		const settings = this.stateManager.getSettings();
		if (!settings.enableTaskWatcher) return;
		if (file.extension !== "md") return;

		// If not scanning all files, check if file is in a relevant folder
		if (!settings.scanAllFiles) {
			const dailyFolder = this.getDailyNotesFolder(settings);
			if (dailyFolder && !file.path.startsWith(dailyFolder)) {
				return;
			}
		}

		try {
			const content = await this.app.vault.cachedRead(file);
			const currentTasks = this.parseTasksFromContent(
				content,
				file.path
			);

			// Get previously cached tasks for this file
			const previousTasks = this.taskCache.get(file.path) || [];

			// Only detect changes if we've done the initial scan
			// (prevents mass XP awards on first load)
			if (this.initialized && previousTasks.length > 0) {
				const newlyCompleted = this.findNewlyCompletedTasks(
					previousTasks,
					currentTasks
				);
				const newlyUncompleted = this.findNewlyUncompletedTasks(
					previousTasks,
					currentTasks
				);

				let changed = false;

				for (const task of newlyCompleted) {
					await this.processCompletedTask(task, settings);
					changed = true;
				}

				for (const task of newlyUncompleted) {
					await this.processUncompletedTask(task, settings);
					changed = true;
				}

				if (changed) {
					// Notify state manager manually if we want the Quests tab to force refresh
					this.stateManager.save();
				}
			}

			// Always update the cache
			this.taskCache.set(file.path, currentTasks);
			// Trigger a fake state bump if Quests tab is active so it re-renders 
			// (StateManager normally only fires when internal state changes)
			this.stateManager.forceNotify();
		} catch (error) {
			console.error("Life RPG: Error processing file change:", error);
		}
	}

	// -------------------------------------------------------------------
	// Task Parsing
	// -------------------------------------------------------------------

	/** Parse all task lines from file content, maintaining hierarchy */
	private parseTasksFromContent(
		content: string,
		filePath: string
	): TrackedTask[] {
		const lines = content.split("\n");
		const tasks: TrackedTask[] = [];
		const stack: { task: TrackedTask; indentLength: number }[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (isTaskLine(line)) {
				// Measure indentation length (tab = 4 spaces)
				const indentMatch = line.match(/^([ \t]*)/);
				const indentStr = indentMatch ? indentMatch[1] : "";
				let indentLength = 0;
				for (const char of indentStr) {
					if (char === "\t") indentLength += 4;
					else indentLength += 1;
				}

				// The ID uses standard logic representing the exact file context so it's extremely robust
				const id = `${filePath}_line_${i}`;

				const task: TrackedTask = {
					id,
					line: i,
					text: line,
					completed: isTaskCompleted(line),
					filePath,
					indentLevel: indentLength,
					parentId: null,
					isSubtask: false,
				};

				// Resolve parent from stack
				while (
					stack.length > 0 &&
					stack[stack.length - 1].indentLength >= indentLength
				) {
					stack.pop(); // Not deeper, so pop out
				}

				if (stack.length > 0) {
					task.parentId = stack[stack.length - 1].task.id;
					task.isSubtask = true;
				}

				tasks.push(task);
				stack.push({ task, indentLength });
			}
		}

		return tasks;
	}

	/**
	 * Compare previous and current task lists to find newly completed tasks.
	 * Uses normalized text matching since line numbers may shift when editing.
	 */
	private findNewlyCompletedTasks(
		previous: TrackedTask[],
		current: TrackedTask[]
	): TrackedTask[] {
		const newlyCompleted: TrackedTask[] = [];

		// Build a map of previously unchecked tasks for O(1) lookup
		const prevUncheckedSet = new Set<string>();
		for (const prev of previous) {
			if (!prev.completed) {
				prevUncheckedSet.add(this.normalizeTaskText(prev.text));
			}
		}

		for (const curr of current) {
			if (!curr.completed) continue;

			const currNorm = this.normalizeTaskText(curr.text);

			// Was this task previously unchecked?
			if (prevUncheckedSet.has(currNorm)) {
				newlyCompleted.push(curr);
				// Remove from set to prevent duplicate matches
				prevUncheckedSet.delete(currNorm);
			}
		}

		return newlyCompleted;
	}

	/**
	 * Compare previous and current task lists to find newly UN-completed tasks.
	 */
	private findNewlyUncompletedTasks(
		previous: TrackedTask[],
		current: TrackedTask[]
	): TrackedTask[] {
		const newlyUncompleted: TrackedTask[] = [];

		// Build a map of previously CHECKED tasks for O(1) lookup
		const prevCheckedSet = new Set<string>();
		for (const prev of previous) {
			if (prev.completed) {
				prevCheckedSet.add(this.normalizeTaskText(prev.text));
			}
		}

		for (const curr of current) {
			if (curr.completed) continue;

			const currNorm = this.normalizeTaskText(curr.text);

			// Was this task previously checked?
			if (prevCheckedSet.has(currNorm)) {
				newlyUncompleted.push(curr);
				prevCheckedSet.delete(currNorm);
			}
		}

		return newlyUncompleted;
	}

	/**
	 * Normalize a task line for comparison by removing the checkbox state.
	 * "- [x] Do stuff [difficulty: hard]" → "Do stuff [difficulty: hard]"
	 */
	private normalizeTaskText(line: string): string {
		return line.replace(/^[\s]*[-*]\s\[[ xX]\]\s*/, "").trim();
	}

	// -------------------------------------------------------------------
	// Task Completion Processing
	// -------------------------------------------------------------------

	/** Process a single completed task — award XP/GP, deal boss damage */
	private async processCompletedTask(
		task: TrackedTask,
		settings: PluginSettings
	): Promise<void> {
		const metadata = parseTaskMetadata(task.text);
		const taskText = getTaskText(task.text);

		// Skip empty task text
		if (!taskText) return;

		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();

		// Process the task through the GameEngine
		const result = processTaskCompletion(
			character,
			skills,
			metadata,
			taskText,
			settings,
			task.isSubtask
		);

		// Update state
		this.stateManager.setCharacter(result.character);
		for (const skill of result.skills) {
			this.stateManager.updateSkill(skill.id, skill);
		}
		for (const entry of result.logEntries) {
			this.stateManager.addLogEntry(entry);
		}
		this.stateManager.incrementTasksCompleted();

		// --- Boss damage ---
		const activeBoss = this.stateManager.getActiveBoss();
		if (activeBoss && settings.bossEnabled && !activeBoss.defeated) {
			const bossDamage = result.result.xp;
			const bossResult = playerAttacksBoss(activeBoss, bossDamage);

			this.stateManager.setActiveBoss(bossResult.boss);
			for (const entry of bossResult.logEntries) {
				this.stateManager.addLogEntry(entry);
			}

			if (bossResult.defeated) {
				let char = this.stateManager.getCharacter();
				char = processGpGain(char, bossResult.boss.gpReward);
				const xpResult = processXpGain(
					char,
					bossResult.boss.xpReward,
					settings.hpPerLevel
				);
				this.stateManager.setCharacter(xpResult.character);
				for (const entry of xpResult.logEntries) {
					this.stateManager.addLogEntry(entry);
				}
				this.stateManager.incrementBossesDefeated();
				this.stateManager.setActiveBoss(null);
				this.stateManager.addBossToHistory(bossResult.boss);

				if (settings.showNotifications) {
					new Notice(
						`🏆 ${bossResult.boss.icon} ${bossResult.boss.name} DEFEATED!\n+${bossResult.boss.xpReward} XP, +${bossResult.boss.gpReward} GP!`,
						8000
					);
				}
			}
		}

		// --- Dungeon progress ---
		const activeDungeon = this.stateManager.getActiveDungeon();
		if (activeDungeon && activeDungeon.active) {
			const dungeonResult = advanceDungeonProgress(activeDungeon);
			this.stateManager.setActiveDungeon(dungeonResult.dungeon);
			for (const entry of dungeonResult.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
			if (dungeonResult.dungeonCleared) {
				this.stateManager.incrementDungeonsCleared();
			}
		}

		// --- Notification ---
		if (settings.showNotifications) {
			let msg = `⚔️ +${result.result.xp} XP, +${result.result.gp} GP`;
			if (result.result.leveledUp) {
				msg += `\n🎉 LEVEL UP → ${result.result.newLevel}!`;
			}
			if (result.result.skillLeveledUp) {
				msg += `\n⬆️ ${result.result.skillName} → Lv.${result.result.newSkillLevel}!`;
			}
			new Notice(msg, result.result.leveledUp ? 6000 : 3000);
		}
	}

	/** Process a single UN-completed task — revert XP/GP, heal boss damage */
	private async processUncompletedTask(
		task: TrackedTask,
		settings: PluginSettings
	): Promise<void> {
		const metadata = parseTaskMetadata(task.text);
		const taskText = getTaskText(task.text);

		if (!taskText) return;

		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();

		// Revert completion
		const result = processTaskUncompletion(
			character,
			skills,
			metadata,
			taskText,
			settings,
			task.isSubtask
		);

		// Update state
		this.stateManager.setCharacter(result.character);
		for (const skill of result.skills) {
			this.stateManager.updateSkill(skill.id, skill);
		}
		for (const entry of result.logEntries) {
			this.stateManager.addLogEntry(entry);
		}

		// --- Boss heal ---
		const activeBoss = this.stateManager.getActiveBoss();
		if (activeBoss && settings.bossEnabled && !activeBoss.defeated) {
			const bossHealAmount = Math.abs(result.result.xp);
			const bossResult = healBoss(activeBoss, bossHealAmount);

			this.stateManager.setActiveBoss(bossResult.boss);
			for (const entry of bossResult.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
		}

		// --- Dungeon un-progress ---
		const activeDungeon = this.stateManager.getActiveDungeon();
		if (activeDungeon && activeDungeon.active) {
			const dungeonResult = revertDungeonProgress(activeDungeon);
			this.stateManager.setActiveDungeon(dungeonResult.dungeon);
		}

		// --- Notification ---
		if (settings.showNotifications) {
			let msg = `📉 Task unchecked: ${result.result.xp} XP, ${result.result.gp} GP restored`;
			if (result.result.leveledUp) { // Using leveledUp field for leveledDown state based on processTaskUncompletion returned RewardResult
				msg += `\n⚠️ LEVEL DOWN → ${result.result.newLevel}!`;
			}
			if (result.result.skillLeveledUp) {
				msg += `\n⚠️ ${result.result.skillName} → Lv.${result.result.newSkillLevel}`;
			}
			new Notice(msg, 4000);
		}
	}
}
