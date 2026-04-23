// ============================================================================
// Life RPG — Task Watcher
// Detects checkbox toggles in markdown files via Obsidian's metadataCache.
// Integrates with Daily Notes / Calendar plugin by monitoring the daily
// notes folder for task completions.
// ============================================================================

import { type App, type TFile, type TAbstractFile, Notice, debounce } from "obsidian";
import { StateManager } from "../state/StateManager";
import { type TrackedTask, type PluginSettings, ItemSlot, EventType, Difficulty } from "../types";
import {
	parseTaskMetadata,
	isTaskLine,
	isTaskCompleted,
	getTaskText,
	parseQuestId,
} from "../utils/parser";
import { processTaskCompletion, processTaskUncompletion, processXpGain, processGpGain, processHpDamage } from "../engine/GameEngine";
import {
	playerAttacksBoss,
	healBoss,
	advanceDungeonProgress,
	revertDungeonProgress,
	bossAttacksPlayer,
	calculateOverdueHazardDamage,
} from "../engine/BossEngine";
import { generateId, INITIAL_ITEMS } from "../constants";
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
			2000,
			false
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

	/** 
	 * MANUALLY trigger a full vault scan to update quests/energy.
	 * This is used when 'Manual Sync Mode' is enabled.
	 */
	public async manualSync(): Promise<void> {
		const settings = this.stateManager.getSettings();
		if (!settings.enableTaskWatcher) return;
		
		new Notice("🔄 Syncing RPG data...");
		this.taskCache.clear();
		await this.performInitialScan();
		new Notice("✅ Sync Complete.");
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

				// Sync names to registry for existing quests
				this.syncQuestRegistry(tasks);

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
		this.syncActiveQuestIds();
		this.processOverdueTasks(settings);
		this.stateManager.forceNotify();
	}

	/** Collect all unique quest IDs for tasks that are currently NOT completed */
	private syncActiveQuestIds(): void {
		// PERFORMANCE: This scans the entire vault cache. 
		// Since onFileChanged is debounced and guarded, this only runs when 
		// a task structurally changes. Still, we use a internal flag to 
		// avoid redundant calculations if multiple files update quickly.
		const activeIds: Set<string> = new Set();

		for (const tasks of this.taskCache.values()) {
			for (const task of tasks) {
				if (!task.completed && task.questId) {
					activeIds.add(task.questId);
				}
			}
		}

		this.stateManager.updateActiveQuestIds(Array.from(activeIds));
	}

	/**
	 * Checks all active tasks for missed deadlines and deals recurring damage
	 * once per day.
	 */
	private async processOverdueTasks(settings: PluginSettings): Promise<void> {
		const state = this.stateManager.getState();
		const today = getTodayStr();
		const now = new Date();

		let char = this.stateManager.getCharacter();
		const boss = this.stateManager.getActiveBoss();
		const activeTasks = this.getActiveTasks();
		const modifiers = this.stateManager.getGlobalModifiers();

		let damageDealt = 0;
		let overdueCount = 0;
		const logEntries: any[] = [];
		let died = false;
		const processedQuestIds: string[] = [];

		for (const task of activeTasks) {
			// 0. Validate task data
			if (!task.text) continue;
			
			// 1. Resolve Metadata
			let meta = parseTaskMetadata(task.text);
			if (task.questId) {
				const registeredMeta = this.stateManager.getQuestMetadata(task.questId);
				if (registeredMeta) {
					meta = { ...meta, ...registeredMeta };
				}
			}

			// 2. Check Overdue Status
			const deadline = meta.endDate || meta.deadline;
			if (!deadline) continue;

			let isOverdue = false;
			if (meta.includeTime) {
				// Exact time check
				const deadlineTime = deadline ? new Date(deadline).getTime() : 0;
				isOverdue = deadlineTime > 0 && now.getTime() > deadlineTime;
			} else {
				// Day-based check: Normalize ISO strings to YYYY-MM-DD
				const deadlineDay = deadline!.includes("T") ? deadline!.split("T")[0] : deadline!;
				isOverdue = deadlineDay < today;
			}

			// 3. Avoid duplicate penalties
			// If it's a day-based deadline and we already checked today, skip it (unless it's a new task)
			if (!meta.includeTime && state.lastOverdueCheckDate === today) continue;

			// If it has been penalized recently, skip
			if (meta.penalizedAt) {
				const lastPenalized = new Date(meta.penalizedAt).getTime();
				// If day-based, wait 24h. If time-based, wait until tomorrow? 
				// Actually, once penalized, a task should stay penalized until completed or edited.
				continue;
			}

			if (isOverdue) {
				overdueCount++;

				if (settings.bossEnabled && boss) {
					const attack = bossAttacksPlayer(boss, char.attributes, modifiers, settings);
					damageDealt += attack.damage;
				} else {
					damageDealt += calculateOverdueHazardDamage(settings, char.attributes, modifiers);
				}

				// Mark task as penalized in memory/registry
				if (task.questId) {
					processedQuestIds.push(task.questId);
					this.stateManager.registerQuestMetadata(task.questId, {
						...meta,
						penalizedAt: now.toISOString()
					});
				}
			}
		}

		// Update the daily check timestamp only if we checked the non-timed ones
		if (state.lastOverdueCheckDate !== today) {
			this.stateManager.updateLastOverdueCheckDate(today);
		}

		if (overdueCount > 0) {
			const wisBonus = settings.wisBonus || 10;
			const actualHpGain = settings.hpPerLevel + (char.attributes.wis.level * wisBonus);
			const mods = this.stateManager.getGlobalModifiers();
			const hpResult = processHpDamage(char, damageDealt, actualHpGain, mods);
			char = hpResult.character;
			died = hpResult.died;

			// Add the aggregated damage notification
			const dmgSource = (settings.bossEnabled && boss) ? `${boss.name} attacked you` : "You took damage";
			logEntries.push({
				id: generateId(),
				timestamp: now.toISOString(),
				type: EventType.BossDamageTaken,
				message: `🚨 OVERDUE: ${dmgSource} for ${damageDealt} HP because of ${overdueCount} missed deadline(s)!`,
				xpDelta: 0,
				gpDelta: 0,
				hpDelta: -damageDealt,
			});

			if (died) {
				logEntries.push(...hpResult.logEntries);
			}

			// Notification
			if (settings.showNotifications) {
				const popupMsg = (settings.bossEnabled && boss)
					? `⚠️ Overdue! ${boss.name} attacked you for ${damageDealt} HP!`
					: `🚨 Overdue Tasks! You took ${damageDealt} HP damage.`;
				new Notice(popupMsg, 5000);
				if (died) {
					new Notice(`💀 YOU DIED! Level dropped to ${char.level}.`, 6000);
				}
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
	 * Get tasks that should be visible in the Quests UI.
	 * Includes all active tasks + tasks completed TODAY.
	 */
	getVisibleTasks(): TrackedTask[] {
		const result: TrackedTask[] = [];
		const completedToday = this.stateManager.getState().completedTodayQuestIds || [];

		for (const [_, tasks] of this.taskCache.entries()) {
			for (const task of tasks) {
				const isCompletedToday = task.questId && completedToday.includes(task.questId);
				if (!task.completed || isCompletedToday) {
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

		// If not scanning all, filter by folder and optional format
		return allFiles.filter((f) => this.isValidDailyNoteFile(f, settings));
	}

	/**
	 * Check if a file is a valid daily note based on settings.
	 * Only checks folder and template format.
	 */
	private isValidDailyNoteFile(file: TFile, settings: PluginSettings): boolean {
		// 1. Folder check
		const dailyFolder = this.getDailyNotesFolder(settings);
		if (dailyFolder) {
			// Ensure path starts with folder + slash, or is exactly the folder (unlikely for a file)
			const normalizedFolder = dailyFolder.endsWith("/") ? dailyFolder : dailyFolder + "/";
			if (!file.path.startsWith(normalizedFolder)) {
				return false;
			}
		}

		// 2. Format check (optional)
		if (!settings.dailyNoteFormat) {
			return true; // No format specified = accept all in folder
		}

		// Convert {{date}} template to a YYYY-MM-DD regex pattern
		const pattern = settings.dailyNoteFormat
			.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
			.replace(/\\\{\\\{date\\\}\\\}/g, "\\d{4}-\\d{2}-\\d{2}"); // Replace {{date}} with date regex

		const regex = new RegExp(`^${pattern}$`);
		return regex.test(file.basename);
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
		if (settings.enableManualSync) return; // SKIP for manual sync mode
		if (file.extension !== "md") return;

		// If not scanning all files, check if file is in a relevant folder/format
		if (!settings.scanAllFiles) {
			if (!this.isValidDailyNoteFile(file, settings)) {
				return;
			}
		}

		try {
			const content = await this.app.vault.cachedRead(file);

			// FAST PATH: If file has zero potential tasks, skip immediately
			if (!content.includes("[ ]") && !content.includes("[x]") && !content.includes("[X]")) {
				if (this.taskCache.has(file.path)) {
					this.taskCache.delete(file.path);
					this.syncActiveQuestIds();
					this.stateManager.forceNotify();
				}
				return;
			}

			const currentTasks = this.parseTasksFromContent(
				content,
				file.path
			);

			// Get previously cached tasks for this file
			const previousTasks = this.taskCache.get(file.path) || [];

			// 1. PERFORMANCE: Only proceed with heavy updates if something structurally changed
			const tasksChanged = this.didTasksChange(previousTasks, currentTasks);
			if (!tasksChanged) return;

			// Sync quest names to registry for persistence
			this.syncQuestRegistry(currentTasks);

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

				let changedCharacter = false;

				for (const task of newlyCompleted) {
					await this.processCompletedTask(task, settings, currentTasks);
					changedCharacter = true;
				}

				for (const task of newlyUncompleted) {
					await this.processUncompletedTask(task, settings, currentTasks);
					changedCharacter = true;
				}

				if (changedCharacter) {
					this.stateManager.save();
				}
			}

			// Always update the cache
			this.taskCache.set(file.path, currentTasks);

			// Update the list of active quest IDs (debounced/optimized inside if needed)
			this.syncActiveQuestIds();

			this.stateManager.forceNotify();
		} catch (error) {
			console.error("Life RPG: Error processing file change:", error);
		}
	}

	/**
	 * PERFORMANCE: Deep compare two task lists to see if we need to trigger state updates.
	 * Returns true if structural changes (completion, new tasks, ID changes) occurred.
	 */
	private didTasksChange(prev: TrackedTask[], curr: TrackedTask[]): boolean {
		if (prev.length !== curr.length) return true;

		for (let i = 0; i < curr.length; i++) {
			const p = prev[i];
			const c = curr[i];

			if (p.completed !== c.completed) return true;
			if (p.questId !== c.questId) return true;
			if (p.text !== c.text) return true; // Name change affects registry and energy contributors
		}

		return false;
	}

	/**
	 * Sync quest names and metadata from a list of tasks into the global registry.
	 */
	private syncQuestRegistry(tasks: TrackedTask[]): void {
		for (const task of tasks) {
			if (task.questId) {
				const cleanName = getTaskText(task.text);
				if (cleanName) {
					const metadata = parseTaskMetadata(task.text);
					this.stateManager.registerQuestMetadata(task.questId, {
						...metadata,
						name: cleanName
					});
				}
			}
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
		const tasks: TrackedTask[] = [];
		const stack: { task: TrackedTask; indentLength: number }[] = [];

		// PERFORMANCE: Instead of split('\n') which creates thousands of strings,
		// we use a regex with the global flag to find ONLY potential task lines.
		const taskRegex = /^[\s]*[-*]\s\[[ xX]\].*$/gm;
		let match;

		while ((match = taskRegex.exec(content)) !== null) {
			const line = match[0];
			
			// Determine line number by counting newlines before this match
			// This is efficient because we only do it for lines that are tasks
			const lineIdx = content.substring(0, match.index).split("\n").length - 1;

			// Measure indentation length
			const indentMatch = line.match(/^([ \t]*)/);
			const indentStr = indentMatch ? indentMatch[1] : "";
			let indentLength = 0;
			for (const char of indentStr) {
				if (char === "\t") indentLength += 4;
				else indentLength += 1;
			}

			const questId = parseQuestId(line);
			const task: TrackedTask = {
				id: `${filePath}_line_${lineIdx}`,
				questId,
				line: lineIdx,
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
		settings: PluginSettings,
		contextTasks?: TrackedTask[]
	): Promise<void> {
		// 1. Get Metadata (Registry Priority)
		let metadata = parseTaskMetadata(task.text);
		if (task.questId) {
			const registeredMeta = this.stateManager.getQuestMetadata(task.questId);
			if (registeredMeta) {
				metadata = { ...metadata, ...registeredMeta };
			}
		}

		const taskText = getTaskText(task.text);

		// Skip empty task text
		if (!taskText) return;

		const state = this.stateManager.getState();

		// Combo Logic: 10 minute window (600,000 ms)
		// Only increment combo if this is a NEW completion (not re-completing already done task)
		const now = new Date();
		let comboCount = state.comboCount;
		const comboWindow = settings.comboWindowMs || 600000; // Default: 10 minutes
		if (state.lastTaskAt) {
			const lastTime = new Date(state.lastTaskAt).getTime();
			if (now.getTime() - lastTime < comboWindow) {
				// Only increment if we haven't already counted this task today
				// Using lastTaskAt to track - if same timestamp, don't increment
				comboCount++;
			} else {
				comboCount = 0;
			}
		}
		this.stateManager.updateMetadata({ lastTaskAt: now.toISOString(), comboCount });

		// Pre-process gear and state
		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();
		const modifiers = this.stateManager.getGlobalModifiers();

		// Determine if parent is a heading
		let parentIsHeading = false;
		if (task.isSubtask && task.parentId) {
			const siblings = contextTasks || this.taskCache.get(task.filePath) || [];
			const parent = siblings.find(t => t.id === task.parentId);
			if (parent) {
				if (parent.questId) {
					parentIsHeading = this.stateManager.getQuestMetadata(parent.questId)?.isHeading || false;
				}
				if (!parentIsHeading) {
					parentIsHeading = parseTaskMetadata(parent.text).isHeading || false;
				}
			}
		}

		// Process the task through the GameEngine
		const result = processTaskCompletion(
			character,
			skills,
			metadata,
			taskText,
			settings,
			modifiers,
			task.isSubtask,
			parentIsHeading,
			comboCount
		);

		// Award SP if earned
		if (result.result.spEarned > 0) {
			this.stateManager.addSkillPoints(result.result.spEarned);
		}

		// Update state
		this.stateManager.setCharacter(result.character);
		for (const skill of result.skills) {
			this.stateManager.updateSkill(skill.id, skill);
		}
		for (const entry of result.logEntries) {
			this.stateManager.addLogEntry(entry);
		}
		this.stateManager.incrementTasksCompleted();

		// --- Energy Persistence Fix ---
		let finalQuestId = task.questId;
		const hasEnergy = metadata.energyM || metadata.energyP || metadata.energyW;
		
		if (hasEnergy && !finalQuestId) {
			// Ad-hoc task with energy: register it with a transient ID so it stays in the load
			finalQuestId = this.stateManager.generateQuestId();
			this.stateManager.registerQuestMetadata(finalQuestId, metadata);
		}
		
		if (finalQuestId) {
			this.stateManager.setQuestCompleted(finalQuestId, true);
		}

		// --- Boss damage ---
		const activeBoss = this.stateManager.getActiveBoss();
		if (activeBoss && settings.bossEnabled && !activeBoss.defeated) {
			const bossDamage = result.result.xp;
			const bossResult = playerAttacksBoss(activeBoss, bossDamage, character.attributes, modifiers, comboCount);

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
					new Notice(`💀 BOSS DEFEATED: ${bossResult.boss.name}!`, 5000);
					new Notice(`💰 +${bossResult.boss.gpReward} GP, ⚔️ +${bossResult.boss.xpReward} XP`, 5000);
				}
			}
		}

		// --- Dungeon progress ---
		const activeDungeon = this.stateManager.getActiveDungeon();
		if (activeDungeon && activeDungeon.active) {
			const dungeonResult = advanceDungeonProgress(activeDungeon, character.attributes, modifiers);
			this.stateManager.setActiveDungeon(dungeonResult.dungeon);

			// Apply Attrition Damage
			if (dungeonResult.damage > 0) {
				const actualHpGain = settings.hpPerLevel + (character.attributes.wis.level * 10);
				const mods = this.stateManager.getGlobalModifiers();
				const hpResult = processHpDamage(this.stateManager.getCharacter(), dungeonResult.damage, actualHpGain, mods);
				this.stateManager.setCharacter(hpResult.character);
				if (hpResult.died) {
					hpResult.logEntries.forEach(log => this.stateManager.addLogEntry(log));
				}
			}

			for (const entry of dungeonResult.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
			if (dungeonResult.dungeonCleared) {
				this.stateManager.incrementDungeonsCleared();
				if (settings.showNotifications) {
					new Notice(`🏰 DUNGEON CLEARED: ${activeDungeon.name}!`, 5000);
				}
			}
		}

		// --- Notification ---
		if (settings.showNotifications) {
			if (result.result.leveledUp) {
				new Notice(`🎉 LEVEL UP! You reached Level ${result.result.newLevel}!`, 5000);
				new Notice(`❤️ Health fully restored! (+${settings.hpPerLevel} Max HP)`, 5000);
			} else if (result.result.skillLeveledUp) {
				new Notice(`🎯 SKILL UP: ${result.result.skillName} reached Level ${result.result.newSkillLevel}!`, 4000);
			} else {
				let msg = `⚔️ +${result.result.xp} XP, +${result.result.gp} GP`;
				new Notice(msg, 3000);
			}
		}

		// TRACK EFFORT: Add to completed today list for persistent energy load
		// Use finalQuestId to include both explicit IDs and transient IDs with energy
		if (finalQuestId) {
			this.stateManager.addCompletedTodayQuestId(finalQuestId);
		}
	}

	/** Process a single UN-completed task — revert XP/GP, heal boss damage */
	private async processUncompletedTask(
		task: TrackedTask,
		settings: PluginSettings,
		contextTasks?: TrackedTask[]
	): Promise<void> {
		let metadata = parseTaskMetadata(task.text);

		// Resolve questId: use explicit ID or check for transient with energy
		let questIdToClean = task.questId;
		const hasEnergy = metadata.energyM || metadata.energyP || metadata.energyW;
		
		if (hasEnergy && !questIdToClean) {
			// Check if there's a completed quest with matching energy that we need to clean
			const completedToday = this.stateManager.getState().completedTodayQuestIds;
			for (const qId of completedToday) {
				const qMeta = this.stateManager.getQuestMetadata(qId);
				if (qMeta && 
				    qMeta.energyM === metadata.energyM && 
				    qMeta.energyP === metadata.energyP && 
				    qMeta.energyW === metadata.energyW) {
					questIdToClean = qId;
					break;
				}
			}
		}

		// CRITICAL: Merge with registry metadata to ensure undo rewards match completion rewards
		if (questIdToClean) {
			const registeredMeta = this.stateManager.getQuestMetadata(questIdToClean);
			if (registeredMeta) {
				metadata = { ...metadata, ...registeredMeta };
			}
		}

		const taskText = getTaskText(task.text);

		if (!taskText) return;

		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();
		const modifiers = this.stateManager.getGlobalModifiers();

		// Determine if parent is a heading
		let parentIsHeading = false;
		if (task.isSubtask && task.parentId) {
			const siblings = contextTasks || this.taskCache.get(task.filePath) || [];
			const parent = siblings.find(t => t.id === task.parentId);
			if (parent) {
				if (parent.questId) {
					parentIsHeading = this.stateManager.getQuestMetadata(parent.questId)?.isHeading || false;
				}
				if (!parentIsHeading) {
					parentIsHeading = parseTaskMetadata(parent.text).isHeading || false;
				}
			}
		}

		const state = this.stateManager.getState();
		const comboCount = state.comboCount;

		// Revert completion
		const result = processTaskUncompletion(
			character,
			skills,
			metadata,
			settings,
			modifiers,
			task.isSubtask,
			taskText,
			parentIsHeading,
			comboCount
		);
		// --- Energy Persistence Fix: Clean up using resolved questId ---
		if (questIdToClean) {
			this.stateManager.setQuestCompleted(questIdToClean, false);
		}

		// Reset combo on uncheck (optional, but prevents abuse)
		this.stateManager.updateMetadata({ comboCount: 0 });

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
			const bossResult = healBoss(activeBoss, bossHealAmount, character.attributes, modifiers, 0);

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

		// TRACK EFFORT: Remove from completed today list on undo
		// Use questIdToClean to handle both explicit and transient IDs
		if (questIdToClean) {
			this.stateManager.removeCompletedTodayQuestId(questIdToClean);
		}
	}
}
