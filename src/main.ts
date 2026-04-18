// ============================================================================
// Life RPG — Main Plugin Entry Point
// Registers views, commands, event listeners, and initializes state.
// ============================================================================

import { Editor, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { logGoodHabit, logBadHabit, evaluateDailyHabits } from "./engine/HabitManager";
import { StateManager } from "./state/StateManager";
import { TaskWatcher } from "./watchers/TaskWatcher";
import { CharacterSheetView } from "./ui/CharacterSheetView";
import { LifeRpgSettingsTab } from "./ui/SettingsTab";
import {
	TaskPropertyModal,
	buildMetadataString,
} from "./ui/modals/TaskPropertyModal";
import { VIEW_TYPE_CHARACTER_SHEET } from "./constants";
import { EventType } from "./types";
import { TaskModifierSuggest } from "./editor/ModifierSuggest";
import { getTodayStr } from "./utils/dateUtils";

export default class LifeRpgPlugin extends Plugin {
	stateManager!: StateManager;
	taskWatcher!: TaskWatcher;

	async onload(): Promise<void> {
		console.log("Life RPG: Loading plugin...");

		// ---------------------------------------------------------------
		// 1. Initialize State Manager
		// ---------------------------------------------------------------
		this.stateManager = new StateManager(this);
		await this.stateManager.load();

		// Check for new day → HP regen
		this.checkNewDay();

		// ---------------------------------------------------------------
		// 2. Initialize Task Watcher
		// ---------------------------------------------------------------
		this.taskWatcher = new TaskWatcher(this.app, this.stateManager);
		if (this.stateManager.getSettings().enableTaskWatcher) {
			this.taskWatcher.start();
		}

		// Register Editor Suggest for autocomplete interactions
		this.registerEditorSuggest(new TaskModifierSuggest(this.app, this));

		// ---------------------------------------------------------------
		// 3. Register the Character Sheet view
		// ---------------------------------------------------------------
		this.registerView(
			VIEW_TYPE_CHARACTER_SHEET,
			(leaf: WorkspaceLeaf) =>
				new CharacterSheetView(leaf, this.stateManager)
		);

		// Add ribbon icon for quick access
		this.addRibbonIcon("sword", "Open Life RPG", () => {
			this.activateCharacterSheet();
		});

		// ---------------------------------------------------------------
		// 4. Register Commands
		// ---------------------------------------------------------------
		this.addCommand({
			id: "open-character-sheet",
			name: "Open Character Sheet",
			callback: () => {
				this.activateCharacterSheet();
			},
		});

		this.addCommand({
			id: "set-task-properties",
			name: "Set Task Properties (Difficulty / Skill / Deadline)",
			editorCallback: (editor: Editor) => {
				const skills = this.stateManager.getSkills();
				new TaskPropertyModal(this.app, skills, (result) => {
					const metaString = buildMetadataString(result, skills);
					const cursor = editor.getCursor();
					const line = editor.getLine(cursor.line);
					// Append metadata to end of line
					editor.setLine(cursor.line, line.trimEnd() + metaString);
				}).open();
			},
		});

		this.addCommand({
			id: "quick-task-easy",
			name: "Complete current task as Easy",
			editorCallback: (editor: Editor) => {
				this.quickCompleteTask(editor, "easy");
			},
		});

		this.addCommand({
			id: "quick-task-medium",
			name: "Complete current task as Medium",
			editorCallback: (editor: Editor) => {
				this.quickCompleteTask(editor, "medium");
			},
		});

		this.addCommand({
			id: "quick-task-hard",
			name: "Complete current task as Hard",
			editorCallback: (editor: Editor) => {
				this.quickCompleteTask(editor, "hard");
			},
		});

		this.addCommand({
			id: "show-stats",
			name: "Show Character Stats",
			callback: () => {
				const char = this.stateManager.getCharacter();
				new Notice(
					`⚔️ Level ${char.level}\n❤️ HP: ${char.hp}/${char.maxHp}\n✨ XP: ${char.xp}/${char.xpToNextLevel}\n💰 GP: ${char.gp}`,
					5000
				);
			},
		});

		// ---------------------------------------------------------------
		// 5. Register Settings Tab
		// ---------------------------------------------------------------
		this.addSettingTab(new LifeRpgSettingsTab(this.app, this));

		// ---------------------------------------------------------------
		// 6. Show startup notification
		// ---------------------------------------------------------------
		const char = this.stateManager.getCharacter();
		if (this.stateManager.getSettings().showNotifications) {
			new Notice(
				`⚔️ Life RPG loaded! Level ${char.level} | HP: ${char.hp}/${char.maxHp} | XP: ${char.xp}/${char.xpToNextLevel} | GP: ${char.gp}`
			);
		}

		console.log("Life RPG: Plugin loaded successfully.");
	}

	async onunload(): Promise<void> {
		console.log("Life RPG: Unloading plugin...");
		this.taskWatcher.stop();
		await this.stateManager.saveImmediate();
	}

	// -------------------------------------------------------------------
	// View Activation
	// -------------------------------------------------------------------

	/** Open the Character Sheet in the right sidebar */
	async activateCharacterSheet(): Promise<void> {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHARACTER_SHEET);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: VIEW_TYPE_CHARACTER_SHEET,
					active: true,
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	// -------------------------------------------------------------------
	// Quick Task Completion (manual via command)
	// -------------------------------------------------------------------

	/** Quickly tag the current line as a task with a difficulty and mark it complete */
	private quickCompleteTask(
		editor: Editor,
		diffLabel: "easy" | "medium" | "hard"
	): void {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);

		// Check if the line is a task
		if (!/^[\s]*[-*]\s\[[ xX]\]/.test(line)) {
			new Notice("❌ Current line is not a task (checkbox).");
			return;
		}

		// Add difficulty if not already present
		if (!/\[(?:difficulty|diff|d)\s*:/i.test(line)) {
			const newLine = line.trimEnd() + ` [difficulty: ${diffLabel}]`;
			editor.setLine(cursor.line, newLine);
		}

		// Mark the task as complete if it isn't already
		if (/^[\s]*[-*]\s\[ \]/.test(line)) {
			const currentLine = editor.getLine(cursor.line);
			editor.setLine(
				cursor.line,
				currentLine.replace(/\[ \]/, "[x]")
			);
		}
	}

	// -------------------------------------------------------------------
	// Daily Check
	// -------------------------------------------------------------------

	/** Check if it's a new day and apply HP regeneration */
	private checkNewDay(): void {
		const state = this.stateManager.getState();
		const today = getTodayStr();

		if (state.lastPlayedDate !== today) {
			const settings = this.stateManager.getSettings();
			const char = this.stateManager.getCharacter();

			// Regenerate HP
			const newHp = Math.min(
				char.maxHp,
				char.hp + settings.dailyHpRegen
			);
			if (newHp !== char.hp) {
				this.stateManager.updateCharacter({ hp: newHp });
				this.stateManager.addLogEntry({
					id: Date.now().toString(36),
					timestamp: new Date().toISOString(),
					type: EventType.HpRegen,
					message: `🌅 New day! Regenerated ${newHp - char.hp} HP.`,
					xpDelta: 0,
					gpDelta: 0,
					hpDelta: newHp - char.hp,
				});
			}

			// Evaluate habits mapping for the daily rollover 
			const habits = this.stateManager.getHabits();
			const result = evaluateDailyHabits(
				habits,
				this.stateManager.getCharacter(),
				this.stateManager.getSkills(),
				this.stateManager.getSettings()
			);
			
			// Save the updated results
			for (const h of result.updatedHabits) {
				this.stateManager.updateHabit(h.id, h);
			}
			this.stateManager.updateCharacter(result.character);
			for (const s of result.skills) {
				this.stateManager.updateSkill(s.id, s);
			}
			for (const entry of result.logEntries) {
				this.stateManager.addLogEntry(entry);
			}

			this.stateManager.updateLastPlayedDate();
		}
	}
}
