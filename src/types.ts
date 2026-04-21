// ============================================================================
// Life RPG — Type Definitions
// All TypeScript interfaces, enums, and type aliases for the plugin.
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Task difficulty levels with their associated multipliers */
export enum Difficulty {
	Easy = 1,
	Medium = 2,
	Hard = 3,
}

/** Item Rarity */
export enum ItemRarity {
	Common = "common",
	Uncommon = "uncommon",
	Rare = "rare",
	Epic = "epic",
	Legendary = "legendary",
}

/** Obsidian Tasks Priority Levels */
export enum TaskPriority {
	Highest = 4,
	High = 3,
	Medium = 2,
	Low = 1,
	Lowest = 0,
}

/** Inventory Slots */
export enum ItemSlot {
	Weapon = "weapon",
	Armor = "armor",
	Accessory = "accessory",
}

/** Core RPG Attributes */
export enum Attribute {
	STR = "str",
	INT = "int",
	WIS = "wis",
	CHA = "cha",
}

/** Item Unlock Conditions */
export enum ConditionType {
	Level = "level",
	AttrStr = "attr_str",
	AttrInt = "attr_int",
	AttrWis = "attr_wis",
	AttrCha = "attr_cha",
	BossesDefeated = "bosses_defeated",
	TasksCompleted = "tasks_completed",
}

export interface LockCondition {
	type: ConditionType;
	value: number;
	description: string;
}

/** Reward Categories */
export enum RewardCategory {
	Item = "item",
	RealLife = "real",
}

/** All event types that can appear in the activity log */
export enum EventType {
	TaskComplete = "task_complete",
	HabitGood = "habit_good",
	HabitBad = "habit_bad",
	LevelUp = "level_up",
	SkillUp = "skill_up",
	RewardPurchase = "reward_purchase",
	BossDamageDealt = "boss_damage_dealt",
	BossDefeated = "boss_defeated",
	BossAttack = "boss_attack",
	HpDamage = "hp_damage",
	HpRegen = "hp_regen",
	DungeonStageComplete = "dungeon_stage_complete",
	DungeonCleared = "dungeon_cleared",
	BossDamageTaken = "boss_damage_taken",
	ItemFound = "item_found",
	ItemEquipped = "item_equipped",
	SkillNodeUnlocked = "skill_node_unlocked",
}

// ---------------------------------------------------------------------------
// Core Game State Interfaces
// ---------------------------------------------------------------------------

export interface AttributeState {
	level: number;
	xp: number;
	xpToNextLevel: number;
}

export interface CharacterAttributes {
	[Attribute.STR]: AttributeState;
	[Attribute.INT]: AttributeState;
	[Attribute.WIS]: AttributeState;
	[Attribute.CHA]: AttributeState;
	con?: AttributeState; // Kept as optional for old state migration
}

/** The player's core character statistics */
export interface CharacterState {
	name: string;
	classId: string; // references CHARACTER_CLASSES dict key
	className: string; // Kept for backwards compatibility, but not actively used for ranks
	avatarUrl: string; // Used to load picture, defaults to emoji
	level: number;
	hp: number;
	maxHp: number;
	xp: number;
	xpToNextLevel: number;
	gp: number;
	attributes: CharacterAttributes;
	equippedItems: Record<ItemSlot, string | null>; // Maps slot to Item ID
}

/** A custom skill that can be leveled independently */
export interface Skill {
	id: string;
	name: string;
	icon: string;
	level: number;
	xp: number;
	xpToNextLevel: number;
	attribute: Attribute; // The governing attribute for this skill
}

/** Skill Tree Node */
export interface SkillTreeNode {
	id: string;
	name: string;
	description: string;
	cost: number;
	icon: string;
	branch: "physique" | "mind" | "spirit" | "fortune";
	x: number;
	y: number;
	dependencies: string[];
	attributeThreshold?: { 
		attribute: Attribute; 
		level: number; 
	};
	modifiers: {
		xpMultiplier?: number;
		gpMultiplier?: number;
		damageBonus?: number;
		hpMax?: number;
		dropChance?: number;
		wisdomSave?: number; // Reduces bad habit damage
		damageReduction?: number;
		hpRegen?: number;
	};
}

/** A recurring habit — either beneficial or detrimental */
export interface Habit {
	id: string;
	name: string;
	icon: string;
	type: "good" | "bad";
	difficulty: Difficulty;
	skillId: string | null;
	streak: number;
	lastCompleted: string | null; // ISO date string
	xpReward: number;
	gpReward: number;
	hpPenalty: number;
	causedDeathLevelDown?: boolean;
	outstandingDays: number;
	lastEvaluatedDate: string | null; // ISO date string without time
	recurrenceDays?: number; // number of days between occurrences (e.g. 1 for daily, 5 for every 5 days)
	history?: Record<string, boolean>; // Retroactive history tracking: DateStr -> Completed
	maxStreak?: number;
	createdAt: string; // ISO date string
	startDate?: string; // Optional manual start date (YYYY-MM-DD)
}

/** A custom reward the player can purchase with GP */
export interface Reward {
	id: string;
	name: string;
	description: string;
	cost: number;
	icon: string;
	purchaseCount: number;
	category: RewardCategory;
	item?: Item; // If present, this reward yields a specific item
}

/** A piece of equipment or consumable item */
export interface Item {
	id: string;
	name: string;
	description: string;
	icon: string;
	rarity: ItemRarity;
	slot: ItemSlot;
	value: number;
	lockCondition?: LockCondition;
	modifiers: {
		str?: number;
		int?: number;
		wis?: number;
		cha?: number;
		hpMax?: number;
		xpBonus?: number; // 0.1 = +10%
		gpBonus?: number;
		damageBonus?: number;
		damageReduction?: number;
		dropChance?: number;
		wisdomSave?: number;
		hpRegen?: number;
	};
}

/** A single entry in the activity/event log */
export interface EventLogEntry {
	id: string;
	timestamp: string; // ISO date string
	type: EventType;
	message: string;
	xpDelta: number;
	gpDelta: number;
	hpDelta: number;
}

// ---------------------------------------------------------------------------
// Task Metadata (parsed from inline markdown)
// ---------------------------------------------------------------------------

/** Metadata parsed from a task line's inline annotations */
export interface TaskMetadata {
	difficulty: Difficulty;
	skillId: string | null;
	deadline: string | null; // ISO date string (Legacy support)
	startDate?: string | null; // ISO string
	endDate?: string | null; // ISO string
	includeTime?: boolean;
	priority?: TaskPriority;
	penalizedAt?: string | null; // ISO timestamp of last penalty trigger
}

/** Represents a tracked task's checkbox state for change detection */
export interface TrackedTask {
	/** Unique deterministic ID for this task instance */
	id: string;
	/** The unique ID for metadata lookup (Sticky ID) */
	questId?: string | null;
	/** The line number in the file */
	line: number;
	/** The full text content of the task line */
	text: string;
	/** Whether the task was completed (checked) */
	completed: boolean;
	/** The file path this task belongs to */
	filePath: string;
	/** Number of leading whitespace characters / indent depth */
	indentLevel: number;
	/** The id of the parent task, if this is a subtask */
	parentId: string | null;
	/** True if this task is nested under another task */
	isSubtask: boolean;
}

// ---------------------------------------------------------------------------
// Boss & Dungeon System
// ---------------------------------------------------------------------------

/** Boss ability that triggers at certain HP thresholds */
export interface BossAbility {
	name: string;
	description: string;
	triggerHpPercent: number; // Triggers when boss HP falls below this %
	effect: "double_damage" | "regen" | "dodge" | "enrage";
}

/** A possible loot drop from boss defeat */
export interface BossLoot {
	itemId: string;
	name: string;
	chance: number; // 0-1 probability
}

/** Template for creating new boss encounters */
export interface BossTemplate {
	name: string;
	icon: string;
	baseHp: number;
	attackPower: number;
	xpReward: number;
	gpReward: number;
	flavor: string;
	abilities?: BossAbility[];
	lootTable?: BossLoot[];
}

/** An active or completed boss fight */
export interface Boss {
	id: string;
	name: string;
	icon: string;
	hp: number;
	maxHp: number;
	attackPower: number;
	xpReward: number;
	gpReward: number;
	flavor: string;
	defeated: boolean;
	startedAt: string; // ISO date
	defeatedAt: string | null;
	abilities?: BossAbility[];
	lootTable?: BossLoot[];
}

/** A single dungeon stage */
export interface DungeonStage {
	name: string;
	description: string;
	tasksRequired: number;
	tasksCompleted: number;
}

/** A multi-stage dungeon encounter */
export interface Dungeon {
	id: string;
	name: string;
	icon: string;
	stages: DungeonStage[];
	currentStage: number;
	boss: Boss | null;
	active: boolean;
	completedAt: string | null;
}

/** Template for creating new dungeons */
export interface DungeonTemplate {
	id: string;
	name: string;
	icon: string;
	stages: {
		name: string;
		description: string;
		tasksRequired: number;
	}[];
	bossTemplate: BossTemplate;
}

// ---------------------------------------------------------------------------
// Aggregate Game State (stored in data.json)
// ---------------------------------------------------------------------------

/** The complete game state persisted to data.json */
export interface GameState {
	// Character
	character: CharacterState;

	// Skills
	skills: Skill[];

	// Skill Tree
	unspentSkillPoints: number;
	unlockedSkillNodes: string[];

	// Habits
	habits: Habit[];

	// Rewards
	rewards: Reward[];

	// Boss fights
	activeBoss: Boss | null;
	bossHistory: Boss[];
	totalBossesDefeated: number;

	// Dungeons
	activeDungeon: Dungeon | null;
	totalDungeonsCleared: number;

	// Activity log
	eventLog: EventLogEntry[];

	// Inventory
	inventory: Item[];
	unseenLogIds: string[];
	lastTaskAt: string | null; // ISO time of last task completion
	comboCount: number;

	// Metadata
	lastPlayedDate: string;
	lastOverdueCheckDate: string; // ISO date string
	totalTasksCompleted: number;
	totalHabitsCompleted: number;

	// Quest Registry
	questRegistry: Record<string, TaskMetadata>;
}

// ---------------------------------------------------------------------------
// Plugin Settings (user-configurable)
// ---------------------------------------------------------------------------

/** Plugin settings configurable via the Settings tab */
export interface PluginSettings {
	// XP / GP base values
	baseXp: number;
	baseGp: number;

	// Difficulty multipliers
	difficultyMultipliers: Record<Difficulty, number>;

	// HP settings
	defaultMaxHp: number;
	hpPerLevel: number;
	dailyHpRegen: number;

	// Boss settings
	bossEnabled: boolean;
	bossDamageOnMissedDeadline: number;

	// Event log
	maxLogEntries: number;

	// Task metadata detection
	enableTaskWatcher: boolean;

	// Daily Notes integration
	dailyNotesFolder: string;
	dailyNoteFormat: string;
	scanAllFiles: boolean;

	// General
	showNotifications: boolean;
	skillToAttributeRatio: number;

	// Habit notes
	habitNotesFolder: string;

	// Boss enrage timer (hours before boss enrages)
	bossEnrageHours: number;

	// Image Caching
	imageCacheSizeCap: number; // in MB
	lastImageCachePrune: string;

	// Editor
	enableEditorSuggestions: boolean;
}

// ---------------------------------------------------------------------------
// State Change Events
// ---------------------------------------------------------------------------

/** Callback type for state change subscriptions */
export type StateChangeCallback = (state: GameState) => void;

/** Reward calculation result from completing a task or habit */
export interface RewardResult {
	xp: number;
	gp: number;
	leveledUp: boolean;
	newLevel: number;
	skillLeveledUp: boolean;
	skillName: string | null;
	newSkillLevel: number;
}
