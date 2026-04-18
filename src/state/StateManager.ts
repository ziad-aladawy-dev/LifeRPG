// ============================================================================
// Life RPG — State Manager
// Manages all game state persistence via data.json with reactive change events.
// ============================================================================

import { type Plugin } from "obsidian";
import {
	type GameState,
	type Skill,
	type Habit,
	type Reward,
	type EventLogEntry,
	type Boss,
	type Dungeon,
	type CharacterState,
	type StateChangeCallback,
	type PluginSettings,
} from "../types";
import { DEFAULT_GAME_STATE, DEFAULT_SETTINGS, DEFAULT_ATTRIBUTES } from "../constants";

/** Deep-merge two objects. Source values override target values. */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
	const output = { ...target };
	for (const key of Object.keys(source) as (keyof T)[]) {
		const sourceVal = source[key];
		const targetVal = target[key];
		if (
			sourceVal !== null &&
			sourceVal !== undefined &&
			typeof sourceVal === "object" &&
			!Array.isArray(sourceVal) &&
			targetVal !== null &&
			targetVal !== undefined &&
			typeof targetVal === "object" &&
			!Array.isArray(targetVal)
		) {
			(output as any)[key] = deepMerge(
				targetVal as Record<string, any>,
				sourceVal as Record<string, any>
			);
		} else if (sourceVal !== undefined) {
			(output as any)[key] = sourceVal;
		}
	}
	return output;
}

export class StateManager {
	private plugin: Plugin;
	private state: GameState;
	private settings: PluginSettings;
	private listeners: StateChangeCallback[] = [];
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private dirty = false;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.state = this.cloneState(DEFAULT_GAME_STATE);
		this.settings = { ...DEFAULT_SETTINGS };
	}

	// -----------------------------------------------------------------------
	// Lifecycle
	// -----------------------------------------------------------------------

	/** Load state and settings from data.json, merging with defaults */
	async load(): Promise<void> {
		const raw = await this.plugin.loadData();
		if (raw) {
			if (raw.gameState) {
				this.state = deepMerge(
					this.cloneState(DEFAULT_GAME_STATE),
					raw.gameState
				);
			}
			if (raw.settings) {
				this.settings = deepMerge({ ...DEFAULT_SETTINGS }, raw.settings);
			}
		}
		// Ensure xpToNextLevel and backwards-compatibility fields are consistent
		const { xpThresholdForLevel } = await import("../constants");
		this.state.character.xpToNextLevel = xpThresholdForLevel(
			this.state.character.level
		);
		// Migrate older states that don't have attributes yet
		if (!this.state.character.attributes) {
			this.state.character.attributes = JSON.parse(JSON.stringify(DEFAULT_ATTRIBUTES));
		}
		// Migrate missing character profile info
		if (!this.state.character.name) this.state.character.name = "Hero";
		if (!this.state.character.classId) {
			// backwards compat logic
			if (this.state.character.className) {
				const lower = this.state.character.className.toLowerCase();
				this.state.character.classId = ["mage", "warrior", "rogue"].includes(lower) ? lower : "adventurer";
			} else {
				this.state.character.classId = "adventurer";
			}
			this.state.character.className = "Adventurer"; // Deprecated basically
		}
		if (!this.state.character.avatarUrl) this.state.character.avatarUrl = "⚔️";

		// Migrate Constitution to Wisdom if necessary
		if (this.state.character.attributes && this.state.character.attributes.con && !this.state.character.attributes.wis) {
			this.state.character.attributes.wis = this.state.character.attributes.con;
			delete this.state.character.attributes.con;
		}
	}

	/** Save state + settings to data.json (debounced) */
	save(): void {
		this.dirty = true;
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(async () => {
			await this.plugin.saveData({
				gameState: this.state,
				settings: this.settings,
			});
			this.dirty = false;
		}, 500);
	}

	/** Force an immediate save (e.g. on plugin unload) */
	async saveImmediate(): Promise<void> {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		await this.plugin.saveData({
			gameState: this.state,
			settings: this.settings,
		});
		this.dirty = false;
	}

	/** Completely reset and wipe progress back to defaults */
	async resetState(): Promise<void> {
		this.state = this.cloneState(DEFAULT_GAME_STATE);
		await this.saveImmediate();
		this.notify();
	}

	/** Force a notification to all listeners even if state didn't change entirely */
	forceNotify(): void {
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Reactive Subscriptions
	// -----------------------------------------------------------------------

	/** Subscribe to state changes. Returns an unsubscribe function. */
	on(callback: StateChangeCallback): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((cb) => cb !== callback);
		};
	}

	/** Notify all listeners of a state change */
	private notify(): void {
		if (this.suppressNotifications) return;
		const snapshot = this.getState();
		for (const cb of this.listeners) {
			cb(snapshot);
		}
	}

	private suppressNotifications = false;

	/** Perform multiple updates and only notify once at the end */
	batchUpdates(callback: () => void): void {
		const wasSuppressed = this.suppressNotifications;
		this.suppressNotifications = true;
		try {
			callback();
		} finally {
			this.suppressNotifications = wasSuppressed;
			if (!wasSuppressed) {
				this.notify();
			}
		}
	}

	// -----------------------------------------------------------------------
	// Getters
	// -----------------------------------------------------------------------

	/** Get a shallow copy of the current game state */
	getState(): GameState {
		return this.cloneState(this.state);
	}

	/** Get the current character state */
	getCharacter(): CharacterState {
		return { ...this.state.character };
	}

	/** Get current settings */
	getSettings(): PluginSettings {
		return { ...this.settings };
	}

	/** Get all skills */
	getSkills(): Skill[] {
		return this.state.skills.map((s) => ({ ...s }));
	}

	/** Get a skill by ID */
	getSkill(id: string): Skill | undefined {
		const skill = this.state.skills.find((s) => s.id === id);
		return skill ? { ...skill } : undefined;
	}

	/** Get all habits */
	getHabits(): Habit[] {
		return this.state.habits.map((h) => ({ ...h }));
	}

	/** Get all rewards */
	getRewards(): Reward[] {
		return this.state.rewards.map((r) => ({ ...r }));
	}

	/** Get the active boss, if any */
	getActiveBoss(): Boss | null {
		return this.state.activeBoss ? { ...this.state.activeBoss } : null;
	}

	/** Get the active dungeon, if any */
	getActiveDungeon(): Dungeon | null {
		return this.state.activeDungeon
			? JSON.parse(JSON.stringify(this.state.activeDungeon))
			: null;
	}

	/** Get the event log */
	getEventLog(): EventLogEntry[] {
		return this.state.eventLog.map((e) => ({ ...e }));
	}



	// -----------------------------------------------------------------------
	// Character Mutations
	// -----------------------------------------------------------------------

	/** Update character fields */
	updateCharacter(partial: Partial<CharacterState>): void {
		this.state.character = { ...this.state.character, ...partial };
		this.save();
		this.notify();
	}

	/** Set the full character state (used by GameEngine after processing) */
	setCharacter(character: CharacterState): void {
		this.state.character = { ...character };
		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Skill Mutations
	// -----------------------------------------------------------------------

	/** Add a new skill */
	addSkill(skill: Skill): void {
		this.state.skills.push({ ...skill });
		this.save();
		this.notify();
	}

	/** Update a skill by ID */
	updateSkill(id: string, partial: Partial<Skill>): void {
		const idx = this.state.skills.findIndex((s) => s.id === id);
		if (idx !== -1) {
			this.state.skills[idx] = { ...this.state.skills[idx], ...partial };
			this.save();
			this.notify();
		}
	}

	/** Remove a skill by ID */
	removeSkill(id: string): void {
		this.state.skills = this.state.skills.filter((s) => s.id !== id);
		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Habit Mutations
	// -----------------------------------------------------------------------

	/** Add a new habit */
	addHabit(habit: Habit): void {
		this.state.habits.push({ ...habit });
		this.save();
		this.notify();
	}

	/** Update a habit by ID */
	updateHabit(id: string, partial: Partial<Habit>): void {
		const idx = this.state.habits.findIndex((h) => h.id === id);
		if (idx !== -1) {
			this.state.habits[idx] = { ...this.state.habits[idx], ...partial };
			this.save();
			this.notify();
		}
	}

	/** Remove a habit by ID */
	removeHabit(id: string): void {
		this.state.habits = this.state.habits.filter((h) => h.id !== id);
		this.save();
		this.notify();
	}

	/** Set habit history state for a specific date (Retroactive adjustment) */
	async setHabitHistory(id: string, dateStr: string, completed: boolean): Promise<void> {
		const habit = this.state.habits.find(h => h.id === id);
		if (!habit) return;

		const { applyRetroactiveHabitHistoryChange } = await import("../engine/HabitManager");
		const result = applyRetroactiveHabitHistoryChange(
			habit,
			dateStr,
			completed,
			this.state.character,
			this.state.skills,
			this.settings
		);

		// Update all states
		const idx = this.state.habits.findIndex(h => h.id === id);
		if (idx !== -1) {
			this.state.habits[idx] = result.habit;
		}
		this.state.character = result.character;
		this.state.skills = result.skills;
		
		// Add logs
		for (const entry of result.logEntries) {
			this.state.eventLog.unshift(entry);
		}
		
		// Trim log
		if (this.state.eventLog.length > this.settings.maxLogEntries) {
			this.state.eventLog = this.state.eventLog.slice(0, this.settings.maxLogEntries);
		}

		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Reward Mutations
	// -----------------------------------------------------------------------

	/** Add a new reward */
	addReward(reward: Reward): void {
		this.state.rewards.push({ ...reward });
		this.save();
		this.notify();
	}

	/** Update a reward by ID */
	updateReward(id: string, partial: Partial<Reward>): void {
		const idx = this.state.rewards.findIndex((r) => r.id === id);
		if (idx !== -1) {
			this.state.rewards[idx] = { ...this.state.rewards[idx], ...partial };
			this.save();
			this.notify();
		}
	}

	/** Remove a reward by ID */
	removeReward(id: string): void {
		this.state.rewards = this.state.rewards.filter((r) => r.id !== id);
		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Boss Mutations
	// -----------------------------------------------------------------------

	/** Set the active boss */
	setActiveBoss(boss: Boss | null): void {
		this.state.activeBoss = boss ? { ...boss } : null;
		this.save();
		this.notify();
	}

	/** Add a boss to history */
	addBossToHistory(boss: Boss): void {
		this.state.bossHistory.push({ ...boss });
		this.save();
	}

	/** Increment total bosses defeated */
	incrementBossesDefeated(): void {
		this.state.totalBossesDefeated++;
		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Dungeon Mutations
	// -----------------------------------------------------------------------

	/** Set the active dungeon */
	setActiveDungeon(dungeon: Dungeon | null): void {
		this.state.activeDungeon = dungeon
			? JSON.parse(JSON.stringify(dungeon))
			: null;
		this.save();
		this.notify();
	}

	/** Increment total dungeons cleared */
	incrementDungeonsCleared(): void {
		this.state.totalDungeonsCleared++;
		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Event Log
	// -----------------------------------------------------------------------

	/** Add an entry to the event log, capped at maxLogEntries */
	addLogEntry(entry: EventLogEntry): void {
		this.state.eventLog.unshift({ ...entry }); // newest first
		if (this.state.eventLog.length > this.settings.maxLogEntries) {
			this.state.eventLog = this.state.eventLog.slice(
				0,
				this.settings.maxLogEntries
			);
		}
		this.save();
		this.notify();
	}

	/** Clear the event log */
	clearEventLog(): void {
		this.state.eventLog = [];
		this.save();
		this.notify();
	}



	// -----------------------------------------------------------------------
	// Statistics
	// -----------------------------------------------------------------------

	/** Increment total tasks completed */
	incrementTasksCompleted(): void {
		this.state.totalTasksCompleted++;
		this.save();
	}

	/** Increment total habits completed */
	incrementHabitsCompleted(): void {
		this.state.totalHabitsCompleted++;
		this.save();
	}

	/** Update last played date */
	updateLastPlayedDate(): void {
		this.state.lastPlayedDate = new Date().toDateString();
		this.save();
	}

	/** Update last overdue check date */
	updateLastOverdueCheckDate(isoDateString: string): void {
		this.state.lastOverdueCheckDate = isoDateString;
		this.save();
	}

	// -----------------------------------------------------------------------
	// Settings Mutations
	// -----------------------------------------------------------------------

	/** Update settings */
	updateSettings(partial: Partial<PluginSettings>): void {
		this.settings = { ...this.settings, ...partial };
		this.save();
		this.notify();
	}

	// -----------------------------------------------------------------------
	// Utilities
	// -----------------------------------------------------------------------

	/** Deep clone game state */
	private cloneState(state: GameState): GameState {
		return JSON.parse(JSON.stringify(state));
	}
}
