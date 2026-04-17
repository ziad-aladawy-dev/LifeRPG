// ============================================================================
// Life RPG — Constants & Defaults
// Default settings, game balance values, and boss templates.
// ============================================================================

import {
	type PluginSettings,
	type GameState,
	type CharacterState,
	type BossTemplate,
	type CharacterAttributes,
	Difficulty,
	Attribute,
} from "./types";

// ---------------------------------------------------------------------------
// View Type Constants
// ---------------------------------------------------------------------------

export const VIEW_TYPE_CHARACTER_SHEET = "life-rpg-character-sheet";

// ---------------------------------------------------------------------------
// Default Plugin Settings
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: PluginSettings = {
	baseXp: 10,
	baseGp: 5,
	difficultyMultipliers: {
		[Difficulty.Easy]: 1,
		[Difficulty.Medium]: 2,
		[Difficulty.Hard]: 3,
	},
	defaultMaxHp: 100,
	hpPerLevel: 5,
	dailyHpRegen: 10,
	bossEnabled: true,
	bossDamageOnMissedDeadline: 10,
	maxLogEntries: 500,
	enableTaskWatcher: true,
	dailyNotesFolder: "",
	scanAllFiles: true,
	showNotifications: true,
};

// ---------------------------------------------------------------------------
// Default Character State
// ---------------------------------------------------------------------------

export const DEFAULT_ATTRIBUTES: CharacterAttributes = {
	[Attribute.STR]: { level: 1, xp: 0, xpToNextLevel: 75 },
	[Attribute.INT]: { level: 1, xp: 0, xpToNextLevel: 75 },
	[Attribute.CON]: { level: 1, xp: 0, xpToNextLevel: 75 },
	[Attribute.CHA]: { level: 1, xp: 0, xpToNextLevel: 75 },
};

export const DEFAULT_CHARACTER: CharacterState = {
	name: "Hero",
	className: "Adventurer",
	avatarUrl: "⚔️",
	level: 1,
	hp: 100,
	maxHp: 100,
	xp: 0,
	xpToNextLevel: 100,
	gp: 0,
	attributes: JSON.parse(JSON.stringify(DEFAULT_ATTRIBUTES)),
};

// ---------------------------------------------------------------------------
// Default Game State
// ---------------------------------------------------------------------------

export const DEFAULT_GAME_STATE: GameState = {
	character: { ...DEFAULT_CHARACTER },
	skills: [],
	habits: [],
	rewards: [],
	activeBoss: null,
	bossHistory: [],
	totalBossesDefeated: 0,
	activeDungeon: null,
	totalDungeonsCleared: 0,
	eventLog: [],
	lastPlayedDate: new Date().toDateString(),
	lastOverdueCheckDate: "",
	totalTasksCompleted: 0,
	totalHabitsCompleted: 0,
};

// ---------------------------------------------------------------------------
// XP Threshold Formulas
// ---------------------------------------------------------------------------

/**
 * Calculate XP required to reach the next character level.
 * Formula: level * 100  (100, 200, 300, ...)
 */
export function xpThresholdForLevel(level: number): number {
	return level * 100;
}

/**
 * Calculate XP required to reach the next skill level.
 * Formula: skillLevel * 75  (75, 150, 225, ...)
 */
export function xpThresholdForSkillLevel(skillLevel: number): number {
	return skillLevel * 75;
}

// ---------------------------------------------------------------------------
// Boss Templates
// ---------------------------------------------------------------------------

export const BOSS_TEMPLATES: BossTemplate[] = [
	{
		name: "Procrastination Dragon",
		icon: "🐉",
		baseHp: 100,
		attackPower: 10,
		xpReward: 150,
		gpReward: 75,
		flavor:
			"A massive wyrm that feeds on unfinished tasks and broken deadlines. Each delay makes it stronger.",
	},
	{
		name: "Distraction Imp",
		icon: "👹",
		baseHp: 50,
		attackPower: 5,
		xpReward: 75,
		gpReward: 35,
		flavor:
			"A mischievous imp that dances at the edge of your focus, luring you away from what matters.",
	},
	{
		name: "Burnout Lich",
		icon: "💀",
		baseHp: 200,
		attackPower: 15,
		xpReward: 300,
		gpReward: 150,
		flavor:
			"An undead sorcerer born from relentless overwork. It drains your life force when you ignore rest.",
	},
	{
		name: "Chaos Goblin",
		icon: "👺",
		baseHp: 75,
		attackPower: 8,
		xpReward: 100,
		gpReward: 50,
		flavor:
			"A creature of pure disorder. It thrives in clutter and crumbles in the face of organization.",
	},
	{
		name: "Anxiety Wraith",
		icon: "👻",
		baseHp: 120,
		attackPower: 12,
		xpReward: 180,
		gpReward: 90,
		flavor:
			"A spectral entity that grows from unchecked worries. Only decisive action can banish it.",
	},
];

// ---------------------------------------------------------------------------
// Default Dungeon Templates
// ---------------------------------------------------------------------------

export interface DungeonTemplate {
	name: string;
	icon: string;
	stages: { name: string; description: string; tasksRequired: number }[];
	bossTemplate: BossTemplate;
}

export const DUNGEON_TEMPLATES: DungeonTemplate[] = [
	{
		name: "The Forge of Focus",
		icon: "🏔️",
		stages: [
			{
				name: "The Outer Caverns",
				description: "Clear the path to deep work.",
				tasksRequired: 3,
			},
			{
				name: "The Ember Halls",
				description: "Maintain concentration under pressure.",
				tasksRequired: 5,
			},
			{
				name: "The Inner Sanctum",
				description: "Achieve flow state mastery.",
				tasksRequired: 7,
			},
		],
		bossTemplate: {
			name: "The Scatter Mind",
			icon: "🌀",
			baseHp: 150,
			attackPower: 12,
			xpReward: 250,
			gpReward: 120,
			flavor:
				"A vortex of fragmented thoughts that guards the deepest level of focus.",
		},
	},
	{
		name: "The Library of Lost Time",
		icon: "📜",
		stages: [
			{
				name: "The Dusty Archives",
				description: "Organize your backlog.",
				tasksRequired: 4,
			},
			{
				name: "The Forgotten Wing",
				description: "Tackle long-overdue tasks.",
				tasksRequired: 6,
			},
			{
				name: "The Forbidden Section",
				description: "Complete the tasks you've been avoiding.",
				tasksRequired: 8,
			},
		],
		bossTemplate: {
			name: "The Chronophage",
			icon: "⏳",
			baseHp: 180,
			attackPower: 14,
			xpReward: 280,
			gpReward: 140,
			flavor: "A time-devouring beast that grows fat on wasted hours.",
		},
	},
];

// ---------------------------------------------------------------------------
// Utility: Generate unique IDs
// ---------------------------------------------------------------------------

export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
