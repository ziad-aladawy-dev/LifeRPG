// ============================================================================
// Life RPG — State Manager
// Manages all game state persistence via data.json with reactive change events.
// ============================================================================

import { type Plugin } from "obsidian";
import { getTodayStr } from "../utils/dateUtils";
import {
	type GameState,
	type Skill,
	type Dungeon,
	type CharacterState,
	type Habit,
	type Boss,
	type EventLogEntry,
	type StateChangeCallback,
	type PluginSettings,
	type Item,
	type Reward,
	ItemSlot,
	ItemRarity,
	RewardCategory,
	EventType,
} from "../types";
import { DEFAULT_GAME_STATE, DEFAULT_SETTINGS, DEFAULT_ATTRIBUTES, INITIAL_ITEMS, SKILL_TREE_NODES, generateId } from "../constants";
import { calculateGlobalModifiers } from "../engine/GameEngine";

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
		if (!this.state.character.avatarUrl) this.state.character.avatarUrl = "⚔️";
		
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

		// Migrate Constitution to Wisdom if necessary
		if (this.state.character.attributes && this.state.character.attributes.con && !this.state.character.attributes.wis) {
			this.state.character.attributes.wis = this.state.character.attributes.con;
			delete (this.state.character.attributes as any).con;
		}

		// Migrate missing equippedItems
		if (!this.state.character.equippedItems) {
			this.state.character.equippedItems = {
				[ItemSlot.Weapon]: null,
				[ItemSlot.Armor]: null,
				[ItemSlot.Accessory]: null,
			};
		}
		
		// Migrate missing inventory/unseen log
		if (!this.state.inventory) this.state.inventory = [];
		if (!this.state.unseenLogIds) this.state.unseenLogIds = [];
		if (this.state.comboCount === undefined) this.state.comboCount = 0;

		// Migrate missing Skill Tree data
		if (this.state.unspentSkillPoints === undefined) this.state.unspentSkillPoints = 0;
		if (this.state.unlockedSkillNodes === undefined) this.state.unlockedSkillNodes = [];

		// Migrate missing createdAt for habits
		for (const habit of this.state.habits) {
			if (!habit.createdAt) {
				habit.createdAt = habit.lastCompleted || new Date().toISOString();
			}
		}

		// Inject INITIAL_ITEMS into rewards store if they don't exist
		for (const itemTemplate of INITIAL_ITEMS) {
			const rewardExists = this.state.rewards.some(r => r.name === itemTemplate.name);
			if (!rewardExists) {
				const cost = itemTemplate.rarity === ItemRarity.Common ? 50 : 250; // Increased base cost
				const reward: Reward = {
					id: generateId(),
					name: itemTemplate.name,
					description: itemTemplate.description,
					icon: itemTemplate.icon,
					cost,
					purchaseCount: 0,
					category: RewardCategory.Item,
					item: itemTemplate
				};
				this.state.rewards.push(reward);
			}
		}

		this.dirty = true;
		await this.saveImmediate();
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

	/** Get the full resource path for a plugin-relative asset */
	getAssetPath(relativePath: string): string {
		const adapter = this.plugin.app.vault.adapter as any;
		const pluginDir = this.plugin.manifest.dir;
		const fullPath = `${pluginDir}/${relativePath}`;
		if (adapter.getResourcePath) {
			return adapter.getResourcePath(fullPath);
		}
		return fullPath;
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

	/** Get unseen log IDs */
	getUnseenLogIds(): string[] {
		return [...this.state.unseenLogIds];
	}

	/** Mark log entries as seen */
	clearUnseenLogs(): void {
		this.state.unseenLogIds = [];
		this.save();
	}

	/** Track a new unseen event */
	addUnseenLogId(id: string): void {
		if (!this.state.unseenLogIds.includes(id)) {
			this.state.unseenLogIds.push(id);
			this.save();
		}
	}

	// -----------------------------------------------------------------------
	// Inventory Operations
	// -----------------------------------------------------------------------

	getInventory(): Item[] {
		return this.state.inventory.map(i => ({ ...i }));
	}

	addItem(item: Item): void {
		this.state.inventory.push({ ...item });
		this.save();
	}

	removeItem(itemId: string): void {
		this.state.inventory = this.state.inventory.filter(i => i.id !== itemId);
		this.save();
	}

	equipItem(itemId: string, slot: ItemSlot): void {
		// Unequip current item in slot if any
		this.state.character.equippedItems[slot] = itemId;
		this.save();
	}

	unequipItem(slot: ItemSlot): void {
		this.state.character.equippedItems[slot] = null;
		this.save();
	}

	getEquippedItem(slot: ItemSlot): Item | null {
		const itemId = this.state.character.equippedItems[slot];
		if (!itemId) return null;
		return this.state.inventory.find(i => i.id === itemId) || null;
	}

	/** Calculate latest global modifiers */
	getGlobalModifiers() {
		return calculateGlobalModifiers(
			this.state.character,
			this.state.inventory,
			this.state.unlockedSkillNodes,
			SKILL_TREE_NODES
		);
	}

	// -----------------------------------------------------------------------
	// Skill Tree Operations
	// -----------------------------------------------------------------------

	getSkillPoints(): number {
		return this.state.unspentSkillPoints;
	}

	getUnlockedSkillNodes(): string[] {
		return [...this.state.unlockedSkillNodes];
	}

	getSkillNodeName(nodeId: string): string {
		const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
		return node ? node.name : "Unknown Node";
	}

	/** Get items available for purchase in store */
	getStoreItems(): Item[] {
		// Filter out items already in inventory (unless they are consumables, which we don't distinguish yet)
		// For now, let's just return the INITIAL_ITEMS that aren't equipped or in inventory
		return INITIAL_ITEMS.filter(item => !this.state.inventory.some(i => i.name === item.name));
	}

	unlockSkillNode(nodeId: string): boolean {
		const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
		if (!node) return false;
		if (this.state.unspentSkillPoints < node.cost) return false;
		if (this.state.unlockedSkillNodes.includes(nodeId)) return false;

		// Check requirements
		const hasRequirements = node.dependencies.every(id => this.state.unlockedSkillNodes.includes(id));
		if (!hasRequirements) return false;

		// Check attribute threshold
		if (node.attributeThreshold) {
			const attr = this.state.character.attributes[node.attributeThreshold.attribute];
			if (!attr || attr.level < node.attributeThreshold.level) return false;
		}

		this.state.unspentSkillPoints -= node.cost;
		this.state.unlockedSkillNodes.push(nodeId);
		
		this.addLogEntry({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillNodeUnlocked,
			message: `🔓 UNLOCKED: **${node.name}**! ${node.description}`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});

		this.save();
		this.notify();
		return true;
	}

	/** Reset Skill Tree (Mirror of Rebirth logic) */
	respecSkillTree(): void {
		let totalRefund = 0;
		for (const nodeId of this.state.unlockedSkillNodes) {
			const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
			if (node) totalRefund += node.cost;
		}
		
		this.state.unspentSkillPoints += totalRefund;
		this.state.unlockedSkillNodes = [];
		
		this.addLogEntry({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillNodeUnlocked,
			message: `🔮 SPIRITUAL REBIRTH: Your skill nodes have been returned as points.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});

		this.save();
		this.notify();
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
		
		const modifiers = this.getGlobalModifiers();

		const oldChar = { ...this.state.character };
		const oldSkills = this.state.skills.map(s => ({ ...s }));

		const result = applyRetroactiveHabitHistoryChange(
			habit,
			dateStr,
			completed,
			this.state.character,
			this.state.skills,
			this.settings,
			modifiers
		);

		// Update all states
		const idx = this.state.habits.findIndex(h => h.id === id);
		if (idx !== -1) {
			this.state.habits[idx] = result.habit;
		}
		this.state.character = result.character;
		this.state.skills = result.skills;

		// Award SP
		if (result.spEarned !== 0) {
			this.addSkillPoints(result.spEarned);
		}

		// Celebrations
		if (this.settings.showNotifications) {
			if (this.state.character.level > oldChar.level) {
				this.celebrationManager.celebrateLevelUp(this.state.character.level, this.settings.hpPerLevel);
			}
			for (const newSkill of this.state.skills) {
				const oldSkill = oldSkills.find(os => os.id === newSkill.id);
				if (oldSkill && newSkill.level > oldSkill.level) {
					this.celebrationManager.celebrateSkillUp(newSkill.name, newSkill.level);
				}
			}
		}
		
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

	/** Purchase an item from the armory */
	purchaseItem(item: Item): void {
		if (this.state.character.gp < item.value) return;

		this.state.character.gp -= item.value;
		this.addItem({ ...item, id: generateId() });

		this.addLogEntry({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.RewardPurchase,
			message: `🛡️ Purchased ${item.name} for ${item.value} GP!`,
			xpDelta: 0,
			gpDelta: -item.value,
			hpDelta: 0,
		});

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
		this.state.lastPlayedDate = getTodayStr();
		this.save();
	}

	/** Update metadata fields like comboCount and lastTaskAt */
	updateMetadata(partial: { comboCount?: number; lastTaskAt?: string | null; lastOverdueCheckDate?: string; unspentSkillPoints?: number }): void {
		if (partial.comboCount !== undefined) this.state.comboCount = partial.comboCount;
		if (partial.lastTaskAt !== undefined) this.state.lastTaskAt = partial.lastTaskAt;
		if (partial.lastOverdueCheckDate !== undefined) this.state.lastOverdueCheckDate = partial.lastOverdueCheckDate;
		if (partial.unspentSkillPoints !== undefined) this.state.unspentSkillPoints = partial.unspentSkillPoints;
		this.save();
	}

	/** Explicitly add skill points to the character */
	addSkillPoints(amount: number): void {
		this.state.unspentSkillPoints += amount;
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
