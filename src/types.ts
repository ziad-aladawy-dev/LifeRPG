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

/** Core RPG Attributes */
export enum Attribute {
	STR = "str",
	INT = "int",
	CON = "con",
	CHA = "cha",
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
	[Attribute.CON]: AttributeState;
	[Attribute.CHA]: AttributeState;
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
}

/** A custom reward the player can purchase with GP */
export interface Reward {
	id: string;
	name: string;
	description: string;
	cost: number;
	icon: string;
	purchaseCount: number;
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
	deadline: string | null; // ISO date string
}

/** Represents a tracked task's checkbox state for change detection */
export interface TrackedTask {
	/** Unique deterministic ID for this task instance */
	id: string;
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

/** Template for creating new boss encounters */
export interface BossTemplate {
	name: string;
	icon: string;
	baseHp: number;
	attackPower: number;
	xpReward: number;
	gpReward: number;
	flavor: string;
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

// ---------------------------------------------------------------------------
// Aggregate Game State (stored in data.json)
// ---------------------------------------------------------------------------

/** The complete game state persisted to data.json */
export interface GameState {
	// Character
	character: CharacterState;

	// Skills
	skills: Skill[];

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

	// Metadata
	lastPlayedDate: string;
	lastOverdueCheckDate: string; // ISO date string
	totalTasksCompleted: number;
	totalHabitsCompleted: number;
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
	scanAllFiles: boolean;

	// General
	showNotifications: boolean;
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
