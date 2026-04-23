// ============================================================================
// Life RPG — State Manager
// Manages all game state persistence via data.json with reactive change events.
// ============================================================================

import { type Plugin, Notice } from "obsidian";
import { getTodayStr } from "../utils/dateUtils";
import { isHabitDue } from "../engine/HabitManager";
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
	type TaskMetadata,
} from "../types";
import { DEFAULT_GAME_STATE, DEFAULT_SETTINGS, DEFAULT_ATTRIBUTES, INITIAL_ITEMS, SKILL_TREE_NODES, generateId } from "../constants";
import { calculateGlobalModifiers } from "../engine/GameEngine";
import { ImageCacheManager } from "../utils/ImageCacheManager";

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
		
		// Day rollover check
		const today = getTodayStr();
		if (this.state.lastPlayedDate && this.state.lastPlayedDate !== today) {
			this.processBurnoutRollover(this.state.lastPlayedDate);
			this.updateLastPlayedDate();
		} else if (!this.state.lastPlayedDate) {
			this.updateLastPlayedDate();
		}
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
				[ItemSlot.Consumable]: null,
			};
		}

		
		// Migrate missing inventory/unseen log
		if (!this.state.inventory) this.state.inventory = [];
		if (!this.state.unseenLogIds) this.state.unseenLogIds = [];
		if (this.state.comboCount === undefined) this.state.comboCount = 0;

		// Migrate missing Skill Tree data
		if (this.state.unspentSkillPoints === undefined) this.state.unspentSkillPoints = 0;
		if (this.state.unlockedSkillNodes === undefined) this.state.unlockedSkillNodes = [];
		if (!this.state.character.energyHistory) this.state.character.energyHistory = {};

		// Migrate missing createdAt for habits
		for (const habit of this.state.habits) {
			if (!habit.createdAt) {
			}
		}

		// Migrate missing quest registry
		if (!this.state.questRegistry) {
			this.state.questRegistry = {};
		}

		// Clean expired buffs
		this.cleanExpiredBuffs();

		// Inject INITIAL_ITEMS into rewards store if they don't exist
		for (const itemTemplate of INITIAL_ITEMS) {
			const rewardExists = this.state.rewards.some(r => r.name === itemTemplate.name);
			if (!rewardExists) {
				const isConsumable = itemTemplate.slot === ItemSlot.Consumable;
				const reward: Reward = {
					id: generateId(),
					name: itemTemplate.name,
					description: itemTemplate.description,
					icon: itemTemplate.icon,
					cost: itemTemplate.value,
					purchaseCount: 0,
					category: isConsumable ? RewardCategory.Consumable : RewardCategory.Item,
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
	/** Update the list of active (incomplete) quests for energy calculation */
	updateActiveQuestIds(ids: string[]): void {
		this.state.activeQuestIds = ids;
		this.notify();
	}

	/** Mark a quest as completed today for effort tracking */
	addCompletedTodayQuestId(id: string): void {
		if (!this.state.completedTodayQuestIds.includes(id)) {
			this.state.completedTodayQuestIds.push(id);
			this.notify();
		}
	}

	/** Remove a quest from today's completed list (e.g. on undo) */
	removeCompletedTodayQuestId(id: string): void {
		this.state.completedTodayQuestIds = this.state.completedTodayQuestIds.filter(qId => qId !== id);
		this.notify();
	}

	/** Restore character HP to its maximum value */
	restoreFullHp(): void {
		const char = this.state.character;
		const maxHp = this.getEffectiveMaxHp();
		
		if (char.hp < maxHp) {
			const regen = maxHp - char.hp;
			this.state.character.hp = maxHp;
			
			this.addLogEntry({
				id: Date.now().toString(36),
				timestamp: new Date().toISOString(),
				type: EventType.HpRegen,
				message: `✨ SACRED RESTORATION: HP fully restored! (+${regen} HP)`,
				xpDelta: 0,
				gpDelta: 0,
				hpDelta: regen,
			});
			
			this.notify();
			this.save();
		}
	}

	/**
	 * Get the character's total Max HP including all bonuses from equipment and skills.
	 */
	getEffectiveMaxHp(): number {
		const modifiers = this.getGlobalModifiers();
		return this.state.character.maxHp + (modifiers.hpMax || 0);
	}

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

	/** Get current daily energy cap (including buffs) */
	getDailyEnergyCap(): number {
		const baseCap = this.settings.dailyEnergyCap || 30;
		const buffBonus = (this.state.character.activeBuffs || [])
			.filter(b => b.type === "energy_cap")
			.reduce((total, b) => total + b.value, 0);
		return baseCap + buffBonus;
	}

	/** Clean up any expired temporary buffs */
	private cleanExpiredBuffs(): void {
		if (!this.state.character.activeBuffs) {
			this.state.character.activeBuffs = [];
			return;
		}
		const now = new Date().toISOString();
		const initialCount = this.state.character.activeBuffs.length;
		this.state.character.activeBuffs = this.state.character.activeBuffs.filter(b => b.expiresAt > now);
		if (this.state.character.activeBuffs.length !== initialCount) {
			this.save();
		}
	}

	// -----------------------------------------------------------------------
	// Skill Tree Operations
	// -----------------------------------------------------------------------

	getTotalSkillPoints(): number {
		return this.state.skills.reduce((total, skill) => total + (skill.level - 1), 0);
	}

	getSpentSkillPoints(): number {
		return this.state.unlockedSkillNodes.reduce((total, nodeId) => {
			const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
			return total + (node ? node.cost : 0);
		}, 0);
	}

	getSkillPoints(): number {
		return this.getTotalSkillPoints() - this.getSpentSkillPoints();
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
		// Filter out items already in inventory (unless they are consumables)
		return INITIAL_ITEMS.filter(item => {
			const isConsumable = item.slot === ItemSlot.Consumable;
			if (isConsumable) return true; // Can always buy more
			return !this.state.inventory.some(i => i.name === item.name);
		});
	}

	unlockSkillNode(nodeId: string): boolean {
		const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
		if (!node) return false;
		if (this.getSkillPoints() < node.cost) return false;
		if (this.state.unlockedSkillNodes.includes(nodeId)) return false;

		// Check requirements
		const hasRequirements = node.dependencies.every(id => this.state.unlockedSkillNodes.includes(id));
		if (!hasRequirements) return false;

		// Check attribute threshold
		if (node.attributeThreshold) {
			const attr = this.state.character.attributes[node.attributeThreshold.attribute];
			if (!attr || attr.level < node.attributeThreshold.level) return false;
		}

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

	/** Use a consumable item from inventory */
	useConsumable(itemId: string): void {
		const item = this.state.inventory.find(i => i.id === itemId);
		if (!item || !item.consumableEffect) return;

		const char = this.state.character;
		const effect = item.consumableEffect;

		this.batchUpdates(() => {
			if (effect.type === "heal") {
				const modifiers = this.getGlobalModifiers();
				const finalMaxHp = char.maxHp + (modifiers.hpMax || 0);
				const oldHp = char.hp;
				char.hp = Math.min(finalMaxHp, char.hp + effect.value);
				new Notice(`🧪 Drank ${item.name}: Healed ${char.hp - oldHp} HP!`);
				this.addLogEntry({
					id: generateId(),
					timestamp: new Date().toISOString(),
					type: EventType.HpRegen,
					message: `🧪 Drank ${item.name}: Healed ${char.hp - oldHp} HP.`,
					xpDelta: 0, gpDelta: 0, hpDelta: char.hp - oldHp
				});
			} else if (effect.type === "energy_boost") {
				const expiresAt = new Date();
				expiresAt.setHours(23, 59, 59, 999); // Expires at end of today
				
				if (!char.activeBuffs) char.activeBuffs = [];
				char.activeBuffs.push({
					type: "energy_cap",
					value: effect.value,
					expiresAt: expiresAt.toISOString()
				});
				
				new Notice(`🌩️ ${item.name} used: Daily Energy Cap +${effect.value} for today!`);
				this.addLogEntry({
					id: generateId(),
					timestamp: new Date().toISOString(),
					type: EventType.ItemEquipped,
					message: `🌩️ Used ${item.name}: Daily Energy Cap +${effect.value} until midnight.`,
					xpDelta: 0, gpDelta: 0, hpDelta: 0
				});
			} else if (effect.type === "respec") {
				this.respecSkillTree();
				new Notice(`🔮 Mirror of Rebirth used: Skills reset!`);
			}

			// Remove item from inventory
			this.removeItem(itemId);
		});
	}

	/** Apply a streak freeze to a specific habit missed day */
	applyStreakFreeze(habitId: string, dateStr: string, itemId: string): boolean {
		const habit = this.state.habits.find(h => h.id === habitId);
		const item = this.state.inventory.find(i => i.id === itemId);
		
		if (!habit || !item || item.consumableEffect?.type !== "streak_freeze") return false;

		this.batchUpdates(() => {
			if (!habit.history) habit.history = {};
			habit.history[dateStr] = "freeze";
			
			// Recalculate streak immediately
			const { recalculateHabitStreak } = require("../engine/HabitManager");
			habit.streak = recalculateHabitStreak(habit);
			
			// Consumes the item
			this.removeItem(itemId);
			
			this.addLogEntry({
				id: generateId(),
				timestamp: new Date().toISOString(),
				type: EventType.ItemEquipped,
				message: `❄️ Streak Seal used on "${habit.name}" for ${dateStr}. Streak preserved!`,
				xpDelta: 0, gpDelta: 0, hpDelta: 0
			});
		});

		new Notice(`❄️ Streak Seal applied to ${habit.name}!`);
		return true;
	}



	// -----------------------------------------------------------------------
	// Character Mutations
	// -----------------------------------------------------------------------

	/** Update character fields */
	updateCharacter(partial: Partial<CharacterState>): void {
		this.state.character = { ...this.state.character, ...partial };
		
		// If avatar URL changed and is external, trigger cache
		if (partial.avatarUrl && partial.avatarUrl.startsWith("http")) {
			ImageCacheManager.getInstance(this.plugin.app).cacheImage(partial.avatarUrl, this.settings);
		}

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
				new Notice(`🎉 LEVEL UP! You reached Level ${this.state.character.level}!`, 5000); //this.state.character.level, this.settings.hpPerLevel);
			}
			for (const newSkill of this.state.skills) {
				const oldSkill = oldSkills.find(os => os.id === newSkill.id);
				if (oldSkill && newSkill.level > oldSkill.level) {
					new Notice(`🎯 SKILL UP: ${newSkill.name} reached Level ${newSkill.level}!`, 4000);
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
			
			// If icon changed and is external, trigger cache
			if (partial.icon && partial.icon.startsWith("http")) {
				ImageCacheManager.getInstance(this.plugin.app).cacheImage(partial.icon, this.settings);
			}

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

	private cloneState(state: GameState): GameState {
		return JSON.parse(JSON.stringify(state));
	}

	// -----------------------------------------------------------------------
	// Quest Registry
	// -----------------------------------------------------------------------

	getQuestMetadata(questId: string): TaskMetadata | null {
		return this.state.questRegistry[questId] || null;
	}

	/** Register or update quest metadata with merging logic */
	registerQuestMetadata(qId: string, metadata: TaskMetadata): void {
		const oldMeta = this.state.questRegistry[qId];
		
		if (!oldMeta) {
			this.state.questRegistry[qId] = metadata;
		} else {
			// Reset penalty if the deadline has changed
			if (metadata.deadline !== undefined && oldMeta.deadline !== metadata.deadline) {
				metadata.penalizedAt = null;
			}
			
			// Deep merge
			this.state.questRegistry[qId] = {
				...oldMeta,
				...metadata
			};
		}

		this.save();
		this.notify();
	}

	/** Record/Remove a quest completion for today's energy tracking */
	setQuestCompleted(questId: string, completed: boolean): void {
		if (!this.state.completedTodayQuestIds) {
			this.state.completedTodayQuestIds = [];
		}
		
		if (completed) {
			if (!this.state.completedTodayQuestIds.includes(questId)) {
				this.state.completedTodayQuestIds.push(questId);
				
				// Also remove from active burdens if present
				if (this.state.activeQuestIds) {
					this.state.activeQuestIds = this.state.activeQuestIds.filter(id => id !== questId);
				}
				
				this.save();
				this.notify();
			}
		} else {
			// Uncompleting
			if (this.state.completedTodayQuestIds.includes(questId)) {
				this.state.completedTodayQuestIds = this.state.completedTodayQuestIds.filter(id => id !== questId);
				
				// We don't necessarily re-add to activeQuestIds here because the next 
				// full vault scan will catch if it's still due today.
				
				this.save();
				this.notify();
			}
		}
	}

	/**
	 * Calculate the total energy load for a specific day.
	 * Includes good habits and dated tasks (deadline, start, or end date matches target date).
	 */
	calculateDailyEnergyLoad(dateStr?: string): { m: number, p: number, w: number, total: number } {
		const targetDate = dateStr || getTodayStr();
		let m = 0, p = 0, w = 0;

		// 1. Habits (Good only and Due today)
		for (const habit of this.state.habits) {
			if (habit.type === "good" && isHabitDue(habit)) {
				m += habit.energyM || 0;
				p += habit.energyP || 0;
				w += habit.energyW || 0;
			}
		}

		// 2. Remaining Burden (Dated Tasks - Strict Deadline & Carryover)
		if (this.state.activeQuestIds) {
			for (const qId of this.state.activeQuestIds) {
				const meta = this.state.questRegistry[qId];
				if (!meta || !meta.deadline || meta.isHeading) continue;
				const deadlineDate = meta.deadline.split("T")[0];
				if (deadlineDate <= targetDate) {
					m += meta.energyM || 0;
					p += meta.energyP || 0;
					w += meta.energyW || 0;
				}
			}
		}

		// 3. Expended Effort (Tasks completed TODAY)
		if (this.state.completedTodayQuestIds) {
			for (const qId of this.state.completedTodayQuestIds) {
				const meta = this.state.questRegistry[qId];
				if (!meta || meta.isHeading) continue;
				m += meta.energyM || 0;
				p += meta.energyP || 0;
				w += meta.energyW || 0;
			}
		}

		return { m, p, w, total: m + p + w };
	}

	/**
	 * Detect burnout based on energy load and apply penalties.
	 * Triggered during daily rollover.
	 */
	processBurnoutRollover(yesterdayStr: string): void {
		const load = this.calculateDailyEnergyLoad(yesterdayStr);
		const cap = this.getDailyEnergyCap();

		// Record in history
		if (!this.state.character.energyHistory) this.state.character.energyHistory = {};
		this.state.character.energyHistory[yesterdayStr] = { ...load, cap };
		
		// Prune history (keep last 14 days)
		const historyKeys = Object.keys(this.state.character.energyHistory).sort();
		if (historyKeys.length > 14) {
			for (let i = 0; i < historyKeys.length - 14; i++) {
				delete this.state.character.energyHistory[historyKeys[i]];
			}
		}

		if (load.total > cap) {
			const damage = 20; // Base burnout damage
			this.state.character.burntOutYesterday = true;
			this.state.character.hp = Math.max(1, this.state.character.hp - damage);
			
			this.addLogEntry({
				id: generateId(),
				timestamp: new Date().toISOString(),
				type: EventType.HpDamage,
				message: `🔥 BURNOUT! Yesterday's energy load (${load.total}) exceeded your cap of ${cap}. You have taken ${damage} damage and have a -25% XP debuff today.`,
				xpDelta: 0,
				gpDelta: 0,
				hpDelta: -damage,
			});
		} else {
			this.state.character.burntOutYesterday = false;
		}
	}

	/** Clear the list of quests completed today */
	clearCompletedToday(): void {
		this.state.completedTodayQuestIds = [];
		this.save();
		this.notify();
	}

	generateQuestId(): string {
		let id: string;
		let attempts = 0;
		do {
			id = Math.random().toString(36).substring(2, 6);
			attempts++;
		} while (this.state.questRegistry[id] && attempts < 100);
		return id;
	}
}
