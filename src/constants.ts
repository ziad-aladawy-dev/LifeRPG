// ============================================================================
// Life RPG — Constants & Defaults
// Default settings, game balance values, and boss templates.
// ============================================================================

import {
	type PluginSettings,
	type GameState,
	type CharacterState,
	type BossTemplate,
	type DungeonTemplate,
	type CharacterAttributes,
	Difficulty,
	Attribute,
	ItemSlot,
	ItemRarity,
	type Item,
	type SkillTreeNode,
	RewardCategory,
	ConditionType,
	EventType,
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
		[Difficulty.Passive]: 1,
		[Difficulty.Easy]: 1.5,
		[Difficulty.Challenging]: 2,
		[Difficulty.Hardcore]: 2.5,
		[Difficulty.Madhouse]: 3,
	},
	defaultMaxHp: 100,
	hpPerLevel: 5,
	dailyHpRegen: 10,
	bossEnabled: true,
	bossDamageOnMissedDeadline: 15,
	maxLogEntries: 500,
	enableTaskWatcher: true,
	dailyNotesFolder: "",
	dailyNoteFormat: "",
	scanAllFiles: true,
	showNotifications: true,
	skillToAttributeRatio: 0.2,
	habitNotesFolder: "Atlas/Habits",
	bossEnrageHours: 48,
	imageCacheSizeCap: 100,
	lastImageCachePrune: new Date().toISOString(),
	enableEditorSuggestions: true,
	dailyEnergyCap: 30,
	energyWeights: {
		mental: 0.2,
		physical: 0.2,
		willpower: 0.2,
	},
};

// ---------------------------------------------------------------------------
// Default Character State
// ---------------------------------------------------------------------------

export const DEFAULT_ATTRIBUTES: CharacterAttributes = {
	[Attribute.STR]: { level: 1, xp: 0, xpToNextLevel: 75 },
	[Attribute.INT]: { level: 1, xp: 0, xpToNextLevel: 75 },
	[Attribute.WIS]: { level: 1, xp: 0, xpToNextLevel: 75 },
	[Attribute.CHA]: { level: 1, xp: 0, xpToNextLevel: 75 },
};

export const DEFAULT_CHARACTER: CharacterState = {
	name: "Hero",
	classId: "adventurer",
	className: "Adventurer",
	avatarUrl: "⚔️",
	level: 1,
	hp: 100,
	maxHp: 100,
	xp: 0,
	xpToNextLevel: 100,
	gp: 0,
	attributes: JSON.parse(JSON.stringify(DEFAULT_ATTRIBUTES)),
	equippedItems: {
		[ItemSlot.Weapon]: null,
		[ItemSlot.Armor]: null,
		[ItemSlot.Accessory]: null,
		[ItemSlot.Consumable]: null,
	},
	activeBuffs: [],
	burntOutYesterday: false,
	energyHistory: {},
};

// ---------------------------------------------------------------------------
// Default Game State
// ---------------------------------------------------------------------------

export const DEFAULT_GAME_STATE: GameState = {
	character: { ...DEFAULT_CHARACTER },
	skills: [],
	unspentSkillPoints: 0,
	unlockedSkillNodes: [],
	habits: [],
	rewards: [
		{
			id: "coffee-reward",
			name: "Fancy Coffee",
			description: "Tastes like productivity. (Real-world reward)",
			cost: 20,
			icon: "coffee",
			purchaseCount: 0,
			category: RewardCategory.RealLife,
		},
		{
			id: "gaming-time",
			name: "1 Hour of Gaming",
			description: "You've earned it! (Real-world reward)",
			cost: 50,
			icon: "gamepad",
			purchaseCount: 0,
			category: RewardCategory.RealLife,
		},
		{
			id: "respec-mirror",
			name: "Mirror of Rebirth",
			description: "Vanish into the reflection to reset your Skill Tree. (Consumable)",
			cost: 2500,
			icon: "sparkles",
			purchaseCount: 0,
			category: RewardCategory.Item,
		}
	],
	activeBoss: null,
	bossHistory: [],
	totalBossesDefeated: 0,
	activeDungeon: null,
	totalDungeonsCleared: 0,
	eventLog: [],
	inventory: [],
	unseenLogIds: [],
	comboCount: 0,
	lastTaskAt: null,
	lastPlayedDate: new Date().toDateString(),
	lastOverdueCheckDate: "",
	totalTasksCompleted: 0,
	totalHabitsCompleted: 0,
	questRegistry: {},
};

// ---------------------------------------------------------------------------
// XP Threshold Formulas
// ---------------------------------------------------------------------------

export function xpThresholdForLevel(level: number): number {
	if (level <= 1) return 100;
	return 100 * (Math.pow(2, level) - 2);
}

export function xpThresholdForSkillLevel(skillLevel: number): number {
	if (skillLevel <= 1) return 75;
	return 75 * (Math.pow(2, skillLevel) - 2);
}

// ---------------------------------------------------------------------------
// Boss Templates
// ---------------------------------------------------------------------------

export const BOSS_TEMPLATES: BossTemplate[] = [
	{
		name: "Procrastination Dragon",
		icon: "🐉",
		baseHp: 100,
		attackPower: 35,
		xpReward: 150,
		gpReward: 75,
		flavor: "A massive wyrm that feeds on unfinished tasks and broken deadlines.",
		abilities: [
			{ name: "Temporal Stall", description: "Deadlines deal 2x damage for 3 tasks.", triggerHpPercent: 50, effect: "double_damage" },
			{ name: "Lazarus Breath", description: "Heals 15% HP if idle for 2+ hours.", triggerHpPercent: 25, effect: "regen" },
		],
		lootTable: [
			{ itemId: "iron-greatsword", name: "Iron Greatsword", chance: 0.2 },
			{ itemId: "ring-of-focus", name: "Ring of Focus", chance: 0.1 },
		],
		scalingAttribute: Attribute.STR,
		scalingFactor: 1.0,
	},
	{
		name: "Distraction Imp",
		icon: "👹",
		baseHp: 50,
		attackPower: 10,
		xpReward: 75,
		gpReward: 35,
		flavor: "A mischievous imp that dances at the edge of your focus.",
		abilities: [
			{ name: "Mirror Image", description: "25% chance to dodge your next attack.", triggerHpPercent: 50, effect: "dodge" },
		],
		lootTable: [
			{ itemId: "lucky-coin", name: "Lucky Coin", chance: 0.3 },
		],
		scalingAttribute: Attribute.CHA,
		scalingFactor: 0.8,
	},
	{
		name: "Burnout Lich",
		icon: "💀",
		baseHp: 200,
		attackPower: 25,
		xpReward: 300,
		gpReward: 150,
		flavor: "An undead sorcerer born from relentless overwork.",
		abilities: [
			{ name: "Soul Drain", description: "Steals 5% of XP earned per task.", triggerHpPercent: 60, effect: "double_damage" },
			{ name: "Undying Will", description: "Heals 20% HP at critical health.", triggerHpPercent: 20, effect: "regen" },
			{ name: "Death's Fury", description: "Attack power doubles at low HP.", triggerHpPercent: 10, effect: "enrage" },
		],
		lootTable: [
			{ itemId: "archmages-staff", name: "Archmage's Staff", chance: 0.08 },
			{ itemId: "monks-robe", name: "Monk's Robe", chance: 0.15 },
		],
		scalingAttribute: Attribute.INT,
		scalingFactor: 1.2,
	},
	{
		name: "Chaos Goblin",
		icon: "👺",
		baseHp: 75,
		attackPower: 8,
		xpReward: 100,
		gpReward: 50,
		flavor: "A creature of pure disorder that thrives on broken routines.",
		abilities: [
			{ name: "Scramble", description: "Randomizes damage dealt for 2 tasks.", triggerHpPercent: 40, effect: "dodge" },
		],
		lootTable: [
			{ itemId: "rabbits-foot", name: "Rabbit's Foot", chance: 0.25 },
			{ itemId: "glass-eye", name: "Glass Eye", chance: 0.2 },
		],
		scalingAttribute: Attribute.CHA,
		scalingFactor: 1.0,
	},
	{
		name: "Anxiety Wraith",
		icon: "👻",
		baseHp: 120,
		attackPower: 12,
		xpReward: 180,
		gpReward: 90,
		flavor: "A spectral entity that grows from unchecked worries.",
		abilities: [
			{ name: "Dread Aura", description: "Boss attacks deal +50% damage.", triggerHpPercent: 50, effect: "enrage" },
			{ name: "Phase Shift", description: "Next 2 attacks deal 0 damage.", triggerHpPercent: 25, effect: "dodge" },
		],
		lootTable: [
			{ itemId: "amulet-of-health", name: "Amulet of Health", chance: 0.15 },
			{ itemId: "beads", name: "Prayer Beads", chance: 0.3 },
		],
		scalingAttribute: Attribute.WIS,
		scalingFactor: 1.1,
	},
	{
		name: "Perfectionism Golem",
		icon: "🗿",
		baseHp: 250,
		attackPower: 30,
		xpReward: 350,
		gpReward: 200,
		flavor: "A stone colossus that demands flawless execution. Nothing is ever good enough.",
		abilities: [
			{ name: "Stone Wall", description: "Reduces incoming damage by 50% for 3 tasks.", triggerHpPercent: 70, effect: "dodge" },
			{ name: "Crumbling", description: "Takes 2x damage when enraged.", triggerHpPercent: 30, effect: "enrage" },
		],
		lootTable: [
			{ itemId: "chainmail", name: "Chainmail", chance: 0.15 },
			{ itemId: "knights-plate", name: "Knight's Plate", chance: 0.05 },
		],
		scalingAttribute: Attribute.STR,
		scalingFactor: 1.5,
	},
];

// ---------------------------------------------------------------------------
// Skill Tree Nodes
// ---------------------------------------------------------------------------

export const SKILL_TREE_NODES: SkillTreeNode[] = [
	// ========================= CORE (Center) =========================
	{ id: "core-1", name: "Awakening", description: "Begin your journey. +5 HP, +2% XP.", cost: 1, icon: "sunrise", branch: "physique", x: 800, y: 640, dependencies: [], modifiers: { hpMax: 5, xpMultiplier: 0.02 } },

	// ========================= PHYSIQUE BRANCH (Upper Left) =========================
	{ id: "phy-1", name: "Sturdy Build", description: "+15 Max HP.", cost: 1, icon: "heart", branch: "physique", x: 608, y: 480, dependencies: ["core-1"], modifiers: { hpMax: 15 } },
	{ id: "phy-2", name: "Iron Fist", description: "+5% Boss Damage.", cost: 2, icon: "sword", branch: "physique", x: 448, y: 352, dependencies: ["phy-1"], modifiers: { damageBonus: 0.05 } },
	{ id: "phy-3", name: "Thick Skin", description: "+8% Damage Reduction.", cost: 2, icon: "shield", branch: "physique", x: 560, y: 256, dependencies: ["phy-1"], modifiers: { damageReduction: 0.08 } },
	{ id: "phy-4", name: "Berserker Rage", description: "+12% Boss Damage.", cost: 3, icon: "flame", branch: "physique", x: 288, y: 224, dependencies: ["phy-2"], modifiers: { damageBonus: 0.12 } },
	{ id: "phy-5", name: "Endurance Ritual", description: "Regen 3 HP per task.", cost: 3, icon: "activity", branch: "physique", x: 672, y: 144, dependencies: ["phy-3"], modifiers: { hpRegen: 3 } },
	{ id: "phy-6", name: "Warlord's Vigor", description: "+50 Max HP, +5% DR.", cost: 5, icon: "shield-check", branch: "physique", x: 480, y: 96, dependencies: ["phy-4", "phy-5"], attributeThreshold: { attribute: Attribute.STR, level: 8 }, modifiers: { hpMax: 50, damageReduction: 0.05 } },
	{ id: "phy-7", name: "Colossus", description: "+100 HP, +15% Boss DMG.", cost: 8, icon: "mountain", branch: "physique", x: 320, y: 48, dependencies: ["phy-6"], attributeThreshold: { attribute: Attribute.STR, level: 15 }, modifiers: { hpMax: 100, damageBonus: 0.15 } },
	{ id: "phy-s1", name: "Battle Hardened", description: "+2% Boss DMG per combo.", cost: 3, icon: "zap", branch: "physique", x: 224, y: 384, dependencies: ["phy-2"], modifiers: { damageBonus: 0.08 } },
	{ id: "phy-s2", name: "Titan's Grip", description: "+20 HP, +3% XP.", cost: 2, icon: "hand-metal", branch: "physique", x: 736, y: 288, dependencies: ["phy-3"], modifiers: { hpMax: 20, xpMultiplier: 0.03 } },

	// ========================= MIND BRANCH (Upper Right) =========================
	{ id: "mind-1", name: "Quick Learner", description: "+5% XP Gain.", cost: 1, icon: "book-open", branch: "mind", x: 992, y: 480, dependencies: ["core-1"], modifiers: { xpMultiplier: 0.05 } },
	{ id: "mind-2", name: "Deep Focus", description: "+8% XP Gain.", cost: 2, icon: "brain", branch: "mind", x: 1152, y: 352, dependencies: ["mind-1"], modifiers: { xpMultiplier: 0.08 } },
	{ id: "mind-3", name: "Speed Reading", description: "+5% Skill XP.", cost: 2, icon: "book", branch: "mind", x: 1040, y: 256, dependencies: ["mind-1"], modifiers: { xpMultiplier: 0.05 } },
	{ id: "mind-4", name: "Analytical Mind", description: "+12% XP Gain.", cost: 3, icon: "microscope", branch: "mind", x: 1312, y: 224, dependencies: ["mind-2"], modifiers: { xpMultiplier: 0.12 } },
	{ id: "mind-5", name: "Polyglot", description: "+8% XP, +3% GP.", cost: 3, icon: "languages", branch: "mind", x: 928, y: 144, dependencies: ["mind-3"], modifiers: { xpMultiplier: 0.08, gpMultiplier: 0.03 } },
	{ id: "mind-6", name: "Scholar's Mastery", description: "+20% XP Gain.", cost: 5, icon: "graduation-cap", branch: "mind", x: 1120, y: 96, dependencies: ["mind-4", "mind-5"], attributeThreshold: { attribute: Attribute.INT, level: 10 }, modifiers: { xpMultiplier: 0.2 } },
	{ id: "mind-7", name: "Archmage's Insight", description: "+30% XP, +5 INT.", cost: 8, icon: "sparkles", branch: "mind", x: 1280, y: 48, dependencies: ["mind-6"], attributeThreshold: { attribute: Attribute.INT, level: 18 }, modifiers: { xpMultiplier: 0.3 } },
	{ id: "mind-s1", name: "Eidetic Memory", description: "+5% XP per streak day.", cost: 3, icon: "file-text", branch: "mind", x: 1376, y: 384, dependencies: ["mind-2"], modifiers: { xpMultiplier: 0.06 } },
	{ id: "mind-s2", name: "Critical Thinking", description: "+10% XP, +2% Boss DMG.", cost: 2, icon: "lightbulb", branch: "mind", x: 864, y: 288, dependencies: ["mind-3"], modifiers: { xpMultiplier: 0.1, damageBonus: 0.02 } },

	// ========================= SPIRIT BRANCH (Lower Left) =========================
	{ id: "spi-1", name: "Zen State", description: "+5% Wisdom Save.", cost: 1, icon: "wind", branch: "spirit", x: 608, y: 800, dependencies: ["core-1"], modifiers: { wisdomSave: 0.05 } },
	{ id: "spi-2", name: "Stoic Resolve", description: "+8% Damage Reduction.", cost: 2, icon: "anchor", branch: "spirit", x: 448, y: 928, dependencies: ["spi-1"], modifiers: { damageReduction: 0.08 } },
	{ id: "spi-3", name: "Meditation", description: "Daily HP Regen +5.", cost: 2, icon: "moon", branch: "spirit", x: 560, y: 1024, dependencies: ["spi-1"], modifiers: { hpRegen: 5 } },
	{ id: "spi-4", name: "Inner Peace", description: "+15% Wisdom Save.", cost: 3, icon: "sun", branch: "spirit", x: 288, y: 1056, dependencies: ["spi-2"], modifiers: { wisdomSave: 0.15 } },
	{ id: "spi-5", name: "Soul Cleanse", description: "Regen 8 HP/task, +5% WIS.", cost: 3, icon: "droplets", branch: "spirit", x: 672, y: 1136, dependencies: ["spi-3"], modifiers: { hpRegen: 8, wisdomSave: 0.05 } },
	{ id: "spi-6", name: "Tranquil Mind", description: "+25% Wisdom Save, +10% DR.", cost: 5, icon: "shield-half", branch: "spirit", x: 480, y: 1184, dependencies: ["spi-4", "spi-5"], attributeThreshold: { attribute: Attribute.WIS, level: 10 }, modifiers: { wisdomSave: 0.25, damageReduction: 0.1 } },
	{ id: "spi-7", name: "Avatar of Calm", description: "Near immunity to habit damage.", cost: 8, icon: "star", branch: "spirit", x: 320, y: 1232, dependencies: ["spi-6"], attributeThreshold: { attribute: Attribute.WIS, level: 18 }, modifiers: { wisdomSave: 0.4, damageReduction: 0.2 } },
	{ id: "spi-s1", name: "Clarity", description: "+5% XP, +5% Wisdom Save.", cost: 3, icon: "eye", branch: "spirit", x: 224, y: 896, dependencies: ["spi-2"], modifiers: { xpMultiplier: 0.05, wisdomSave: 0.05 } },
	{ id: "spi-s2", name: "Grounding", description: "+20 HP, +5% WIS Save.", cost: 2, icon: "tree-pine", branch: "spirit", x: 736, y: 992, dependencies: ["spi-3"], modifiers: { hpMax: 20, wisdomSave: 0.05 } },

	// ========================= FORTUNE BRANCH (Lower Right) =========================
	{ id: "for-1", name: "Bounty Hunter", description: "+8% Gold Gain.", cost: 1, icon: "coins", branch: "fortune", x: 992, y: 800, dependencies: ["core-1"], modifiers: { gpMultiplier: 0.08 } },
	{ id: "for-2", name: "Lucky Find", description: "+5% Drop Chance.", cost: 2, icon: "clover", branch: "fortune", x: 1152, y: 928, dependencies: ["for-1"], modifiers: { dropChance: 0.05 } },
	{ id: "for-3", name: "Bargain Sense", description: "+10% GP Gain.", cost: 2, icon: "handshake", branch: "fortune", x: 1040, y: 1024, dependencies: ["for-1"], modifiers: { gpMultiplier: 0.1 } },
	{ id: "for-4", name: "Treasure Sense", description: "+10% Drop Chance.", cost: 3, icon: "search", branch: "fortune", x: 1312, y: 1056, dependencies: ["for-2"], modifiers: { dropChance: 0.1 } },
	{ id: "for-5", name: "Golden Tongue", description: "+15% GP, +5% XP.", cost: 3, icon: "message-circle", branch: "fortune", x: 928, y: 1136, dependencies: ["for-3"], modifiers: { gpMultiplier: 0.15, xpMultiplier: 0.05 } },
	{ id: "for-6", name: "Merchant Prince", description: "+25% GP, +5% Drop.", cost: 5, icon: "crown", branch: "fortune", x: 1120, y: 1184, dependencies: ["for-4", "for-5"], attributeThreshold: { attribute: Attribute.CHA, level: 10 }, modifiers: { gpMultiplier: 0.25, dropChance: 0.05 } },
	{ id: "for-7", name: "King Midas", description: "+50% GP, +15% Drop.", cost: 8, icon: "gem", branch: "fortune", x: 1280, y: 1232, dependencies: ["for-6"], attributeThreshold: { attribute: Attribute.CHA, level: 20 }, modifiers: { gpMultiplier: 0.5, dropChance: 0.15 } },
	{ id: "for-s1", name: "Scavenger", description: "+8% Drop Chance.", cost: 3, icon: "package", branch: "fortune", x: 1376, y: 896, dependencies: ["for-2"], modifiers: { dropChance: 0.08 } },
	{ id: "for-s2", name: "Charm", description: "+5% GP, +5% WIS.", cost: 2, icon: "heart-handshake", branch: "fortune", x: 864, y: 992, dependencies: ["for-3"], modifiers: { gpMultiplier: 0.05, wisdomSave: 0.05 } },

	// ========================= BRIDGE NODES (Cross-branch synergies) =========================
	{ id: "bridge-pm", name: "War Scholar", description: "+8% XP, +8% Boss DMG.", cost: 5, icon: "swords", branch: "physique", x: 800, y: 240, dependencies: ["phy-3", "mind-3"], modifiers: { xpMultiplier: 0.08, damageBonus: 0.08 } },
	{ id: "bridge-sf", name: "Karma", description: "+10% GP, +10% WIS Save.", cost: 5, icon: "scale", branch: "spirit", x: 800, y: 1040, dependencies: ["spi-3", "for-3"], modifiers: { gpMultiplier: 0.1, wisdomSave: 0.1 } },
	{ id: "bridge-ps", name: "Paladin's Oath", description: "+30 HP, +10% WIS Save.", cost: 5, icon: "heart-pulse", branch: "physique", x: 400, y: 672, dependencies: ["phy-1", "spi-1"], modifiers: { hpMax: 30, wisdomSave: 0.1 } },
	{ id: "bridge-mf", name: "Alchemist", description: "+10% XP, +10% GP.", cost: 5, icon: "flask-conical", branch: "fortune", x: 1200, y: 672, dependencies: ["mind-1", "for-1"], modifiers: { xpMultiplier: 0.1, gpMultiplier: 0.1 } },
];

// ---------------------------------------------------------------------------
// Expansion: Initial Items (50+ Entries)
// ---------------------------------------------------------------------------

export const INITIAL_ITEMS: Item[] = [
	// --- WEAPONS ---
	{ id: "dull-dagger", name: "Dull Dagger", description: "+5% STR XP.", icon: "assets/items/dull-dagger.png", rarity: ItemRarity.Common, slot: ItemSlot.Weapon, value: 50, modifiers: { xpBonus: 0.05, str: 1 } },
	{ id: "training-sword", name: "Training Sword", description: "+2% All XP.", icon: "assets/items/training-sword.png", rarity: ItemRarity.Common, slot: ItemSlot.Weapon, value: 30, modifiers: { xpBonus: 0.02 } },
	{ id: "wooden-bow", name: "Wooden Bow", description: "Standard utility. +2% All XP.", icon: "assets/items/wooden-bow.png", rarity: ItemRarity.Common, slot: ItemSlot.Weapon, value: 40, lockCondition: { type: ConditionType.Level, value: 2, description: "Requires Level 2" }, modifiers: { xpBonus: 0.02 } },
	{ id: "rusty-blade", name: "Rusty Blade", description: "+5% Boss DMG.", icon: "assets/items/rusty-blade.png", rarity: ItemRarity.Common, slot: ItemSlot.Weapon, value: 50, lockCondition: { type: ConditionType.Level, value: 3, description: "Requires Level 3" }, modifiers: { damageBonus: 0.05 } },
	{ id: "splintered-staff", name: "Splintered Staff", description: "+5% INT XP.", icon: "assets/items/splintered-staff.png", rarity: ItemRarity.Common, slot: ItemSlot.Weapon, value: 50, lockCondition: { type: ConditionType.Level, value: 4, description: "Requires Level 4" }, modifiers: { xpBonus: 0.05, int: 1 } },
	{ id: "iron-greatsword", name: "Iron Greatsword", description: "+10% Boss DMG.", icon: "assets/items/iron-greatsword.png", rarity: ItemRarity.Uncommon, slot: ItemSlot.Weapon, value: 450, lockCondition: { type: ConditionType.AttrStr, value: 5, description: "Requires 5 STR" }, modifiers: { damageBonus: 0.1, str: 2 } },
	{ id: "quartz-wand", name: "Quartz Wand", description: "+10% INT XP.", icon: "assets/items/quartz-wand.png", rarity: ItemRarity.Uncommon, slot: ItemSlot.Weapon, value: 300, lockCondition: { type: ConditionType.AttrInt, value: 5, description: "Requires 5 INT" }, modifiers: { xpBonus: 0.1, int: 3 } },
	{ id: "viking-axe", name: "Viking Axe", description: "+15% STR XP.", icon: "assets/items/viking-axe.png", rarity: ItemRarity.Uncommon, slot: ItemSlot.Weapon, value: 350, lockCondition: { type: ConditionType.AttrStr, value: 10, description: "Requires 10 STR" }, modifiers: { xpBonus: 0.15, str: 5 } },
	{ id: "silver-rapier", name: "Silver Rapier", description: "+15% Boss DMG.", icon: "assets/items/silver-rapier.png", rarity: ItemRarity.Rare, slot: ItemSlot.Weapon, value: 1200, lockCondition: { type: ConditionType.Level, value: 10, description: "Requires Level 10" }, modifiers: { damageBonus: 0.15, str: 4, cha: 2 } },
	{ id: "elven-longbow", name: "Elven Longbow", description: "Precision tool. +10% Boss DMG.", icon: "assets/items/elven-longbow.png", rarity: ItemRarity.Rare, slot: ItemSlot.Weapon, value: 1500, lockCondition: { type: ConditionType.AttrWis, value: 10, description: "Requires 10 WIS" }, modifiers: { damageBonus: 0.1, wis: 5 } },
	{ id: "morning-star", name: "Morning Star", description: "Heavy impact. +10% STR XP.", icon: "hammer", rarity: ItemRarity.Uncommon, slot: ItemSlot.Weapon, value: 500, lockCondition: { type: ConditionType.AttrStr, value: 15, description: "Requires 15 STR" }, modifiers: { xpBonus: 0.1, str: 6 } },
	{ id: "cursed-blade", name: "Cursed Blade", description: "+40% Boss DMG but -10 HP.", icon: "skull", rarity: ItemRarity.Rare, slot: ItemSlot.Weapon, value: 2500, lockCondition: { type: ConditionType.BossesDefeated, value: 3, description: "Defeat 3 Bosses" }, modifiers: { damageBonus: 0.4, hpMax: -10 } },
	{ id: "bloodhound-scythe", name: "Bloodhound Scythe", description: "+20% Boss DMG.", icon: "assets/items/bloodhound-scythe.png", rarity: ItemRarity.Rare, slot: ItemSlot.Weapon, value: 2000, lockCondition: { type: ConditionType.BossesDefeated, value: 1, description: "Defeat 1 Boss" }, modifiers: { damageBonus: 0.2, str: 8 } },
	{ id: "archmages-staff", name: "Archmage's Staff", description: "+25% XP Bonus.", icon: "assets/items/archmages-staff.png", rarity: ItemRarity.Epic, slot: ItemSlot.Weapon, value: 5000, lockCondition: { type: ConditionType.AttrInt, value: 15, description: "Requires 15 INT" }, modifiers: { xpBonus: 0.25, int: 10, wis: 5 } },
	{ id: "sages-staff", name: "Sage's Staff", description: "+30% XP.", icon: "assets/items/sages-staff.png", rarity: ItemRarity.Epic, slot: ItemSlot.Weapon, value: 7500, lockCondition: { type: ConditionType.AttrInt, value: 20, description: "Requires 20 INT" }, modifiers: { xpBonus: 0.3, int: 15 } },
	{ id: "dragonslayer-spear", name: "Dragonslayer Spear", description: "+50% Boss DMG.", icon: "assets/items/dragonslayer-spear.png", rarity: ItemRarity.Legendary, slot: ItemSlot.Weapon, value: 15000, lockCondition: { type: ConditionType.BossesDefeated, value: 10, description: "Defeat 10 Bosses" }, modifiers: { damageBonus: 0.5, str: 20 } },
	{ id: "mythic-shard", name: "Excalibur Fragment", description: "+10 All Attributes.", icon: "assets/items/excalibur-fragment.png", rarity: ItemRarity.Legendary, slot: ItemSlot.Weapon, value: 20000, lockCondition: { type: ConditionType.TasksCompleted, value: 100, description: "Complete 100 Tasks" }, modifiers: { str: 10, int: 10, wis: 10, cha: 10, damageBonus: 0.3 } },
	
	// --- ARMOR ---
	{ id: "rags", name: "Beggars Rags", description: "You start somewhere. +1 HP.", icon: "🧵", rarity: ItemRarity.Common, slot: ItemSlot.Armor, value: 10, modifiers: { hpMax: 1 } },
	{ id: "rough-tunic", name: "Rough Tunic", description: "+5 HP.", icon: "shirt", rarity: ItemRarity.Common, slot: ItemSlot.Armor, value: 40, lockCondition: { type: ConditionType.Level, value: 2, description: "Requires Level 2" }, modifiers: { hpMax: 5 } },
	{ id: "boiled-leather", name: "Boiled Leather", description: "+5% DMG Reduction.", icon: "shield-half", rarity: ItemRarity.Common, slot: ItemSlot.Armor, value: 100, lockCondition: { type: ConditionType.Level, value: 3, description: "Requires Level 3" }, modifiers: { damageReduction: 0.05, str: 1 } },
	{ id: "chainmail", name: "Chainmail", description: "+10% DMG Reduction.", icon: "link", rarity: ItemRarity.Uncommon, slot: ItemSlot.Armor, value: 600, lockCondition: { type: ConditionType.Level, value: 5, description: "Requires Level 5" }, modifiers: { damageReduction: 0.1, hpMax: 25 } },
	{ id: "plate-boots", name: "Steel Sabatons", description: "+10 HP, +2% DMG Reduction.", icon: "footprints", rarity: ItemRarity.Uncommon, slot: ItemSlot.Armor, value: 350, lockCondition: { type: ConditionType.TasksCompleted, value: 10, description: "Complete 10 Tasks" }, modifiers: { hpMax: 10, damageReduction: 0.02 } },
	{ id: "silk-doublet", name: "Silk Doublet", description: "+5% CHA XP.", icon: "sparkles", rarity: ItemRarity.Uncommon, slot: ItemSlot.Armor, value: 450, lockCondition: { type: ConditionType.AttrCha, value: 5, description: "Requires 5 CHA" }, modifiers: { xpBonus: 0.05, cha: 4 } },
	{ id: "rogues-hood", name: "Rogue's Hood", description: "+10% Drop Chance, +5 CHA.", icon: "user", rarity: ItemRarity.Uncommon, slot: ItemSlot.Armor, value: 800, lockCondition: { type: ConditionType.AttrCha, value: 6, description: "Requires 6 CHA" }, modifiers: { dropChance: 0.1, cha: 5 } },
	{ id: "monks-robe", name: "Monk's Robe", description: "+10% WIS.", icon: "wind", rarity: ItemRarity.Uncommon, slot: ItemSlot.Armor, value: 500, lockCondition: { type: ConditionType.AttrWis, value: 5, description: "Requires 5 WIS" }, modifiers: { wis: 5, wisdomSave: 0.05 } },
	{ id: "wizard-hat", name: "Wizard's Hat", description: "+15 INT, +10% XP.", icon: "hat", rarity: ItemRarity.Rare, slot: ItemSlot.Armor, value: 5000, lockCondition: { type: ConditionType.AttrInt, value: 10, description: "Requires 10 INT" }, modifiers: { int: 15, xpBonus: 0.1 } },
	{ id: "shadow-cloak", name: "Shadow Cloak", description: "+15% Drop Chance.", icon: "ghost", rarity: ItemRarity.Rare, slot: ItemSlot.Armor, value: 3000, lockCondition: { type: ConditionType.AttrCha, value: 10, description: "Requires 10 CHA" }, modifiers: { dropChance: 0.15, cha: 5 } },
	{ id: "hero-cape", name: "Hero's Cape", description: "+20 HP, +5% All XP.", icon: "shirt", rarity: ItemRarity.Rare, slot: ItemSlot.Armor, value: 4500, lockCondition: { type: ConditionType.Level, value: 15, description: "Requires Level 15" }, modifiers: { hpMax: 20, xpBonus: 0.05 } },
	{ id: "knights-plate", name: "Knight's Plate", description: "+15% DMG Reduction.", icon: "shield", rarity: ItemRarity.Rare, slot: ItemSlot.Armor, value: 2500, lockCondition: { type: ConditionType.TasksCompleted, value: 50, description: "Complete 50 Tasks" }, modifiers: { damageReduction: 0.15, hpMax: 20, str: 5 } },
	{ id: "mithril-shirt", name: "Mithril Shirt", description: "Light but strong. +15% DR.", icon: "shirt", rarity: ItemRarity.Epic, slot: ItemSlot.Armor, value: 8500, lockCondition: { type: ConditionType.Level, value: 25, description: "Requires Level 25" }, modifiers: { damageReduction: 0.15, hpMax: 50 } },
	{ id: "spartan-shield", name: "Spartan Shield", description: "+20% DR.", icon: "shield", rarity: ItemRarity.Epic, slot: ItemSlot.Armor, value: 9500, lockCondition: { type: ConditionType.TasksCompleted, value: 75, description: "Complete 75 Tasks" }, modifiers: { damageReduction: 0.2, str: 10 } },
	{ id: "valkyrie-helm", name: "Valkyrie Helm", description: "+20% Boss DMG, +20 HP.", icon: "crown", rarity: ItemRarity.Epic, slot: ItemSlot.Armor, value: 10000, lockCondition: { type: ConditionType.Level, value: 30, description: "Requires Level 30" }, modifiers: { damageBonus: 0.2, hpMax: 20 } },
	{ id: "dragons-guard", name: "Dragon-Scale Plate", description: "+25% DMG Reduction.", icon: "🐉", rarity: ItemRarity.Epic, slot: ItemSlot.Armor, value: 9000, lockCondition: { type: ConditionType.AttrStr, value: 20, description: "Requires 20 STR" }, modifiers: { damageReduction: 0.25, hpMax: 100, str: 15 } },
	{ id: "celestial-garb", name: "Celestial Garb", description: "+200 HP.", icon: "🌟", rarity: ItemRarity.Legendary, slot: ItemSlot.Armor, value: 25000, lockCondition: { type: ConditionType.BossesDefeated, value: 7, description: "Defeat 7 Bosses" }, modifiers: { hpMax: 200, damageReduction: 0.4 } },
	
	// --- ACCESSORIES ---
	{ id: "faded-map", name: "Faded Map", description: "+5% XP.", icon: "map", rarity: ItemRarity.Common, slot: ItemSlot.Accessory, value: 150, modifiers: { xpBonus: 0.05, wis: 1 } },
	{ id: "lucky-coin", name: "Lucky Coin", description: "+5% GP.", icon: "coins", rarity: ItemRarity.Common, slot: ItemSlot.Accessory, value: 150, modifiers: { gpBonus: 0.05, cha: 1 } },
	{ id: "beads", name: "Prayer Beads", description: "+5% Wisdom Save.", icon: "🔮", rarity: ItemRarity.Common, slot: ItemSlot.Accessory, value: 80, lockCondition: { type: ConditionType.AttrWis, value: 3, description: "Requires 3 WIS" }, modifiers: { wisdomSave: 0.05 } },
	{ id: "glass-eye", name: "Glass Eye", description: "+2% Drop Chance.", icon: "scan-eye", rarity: ItemRarity.Common, slot: ItemSlot.Accessory, value: 100, lockCondition: { type: ConditionType.TasksCompleted, value: 5, description: "Complete 5 Tasks" }, modifiers: { dropChance: 0.02 } },
	{ id: "emerald-ring", name: "Emerald Ring", description: "+5% GP, +5 HP.", icon: "circle", rarity: ItemRarity.Uncommon, slot: ItemSlot.Accessory, value: 650, lockCondition: { type: ConditionType.Level, value: 4, description: "Requires Level 4" }, modifiers: { gpBonus: 0.05, hpMax: 5 } },
	{ id: "amulet-of-health", name: "Amulet of Health", description: "+20 HP.", icon: "heart-pulse", rarity: ItemRarity.Uncommon, slot: ItemSlot.Accessory, value: 700, lockCondition: { type: ConditionType.Level, value: 5, description: "Requires Level 5" }, modifiers: { hpMax: 20 } },
	{ id: "ring-of-focus", name: "Ring of Focus", description: "+10% XP.", icon: "circle-dot", rarity: ItemRarity.Uncommon, slot: ItemSlot.Accessory, value: 800, lockCondition: { type: ConditionType.AttrInt, value: 5, description: "Requires 5 INT" }, modifiers: { xpBonus: 0.1, int: 5 } },
	{ id: "vial-of-light", name: "Vial of Light", description: "+5% All XP.", icon: "beaker", rarity: ItemRarity.Uncommon, slot: ItemSlot.Accessory, value: 900, lockCondition: { type: ConditionType.Level, value: 8, description: "Requires Level 8" }, modifiers: { xpBonus: 0.05 } },
	{ id: "merchants-bag", name: "Merchant's Bag", description: "+15% GP Gain.", icon: "briefcase", rarity: ItemRarity.Uncommon, slot: ItemSlot.Accessory, value: 1200, lockCondition: { type: ConditionType.AttrCha, value: 8, description: "Requires 8 CHA" }, modifiers: { gpBonus: 0.15 } },
	{ id: "rabbits-foot", name: "Rabbit's Foot", description: "+5% Drop Chance.", icon: "clover", rarity: ItemRarity.Uncommon, slot: ItemSlot.Accessory, value: 400, lockCondition: { type: ConditionType.TasksCompleted, value: 15, description: "Complete 15 Tasks" }, modifiers: { dropChance: 0.05 } },
	{ id: "gladiators-glove", name: "Gladiator's Glove", description: "+10 STR, +5% Boss DMG.", icon: "hand-metal", rarity: ItemRarity.Rare, slot: ItemSlot.Accessory, value: 4200, lockCondition: { type: ConditionType.AttrStr, value: 12, description: "Requires 12 STR" }, modifiers: { str: 10, damageBonus: 0.05 } },
	{ id: "soul-lantern", name: "Soul Lantern", description: "+25% WIS XP.", icon: "lamp", rarity: ItemRarity.Rare, slot: ItemSlot.Accessory, value: 3800, lockCondition: { type: ConditionType.AttrWis, value: 15, description: "Requires 15 WIS" }, modifiers: { xpBonus: 0.25, wis: 5 } },
	{ id: "hunters-lens", name: "Hunter's Lens", description: "+10% Boss DMG.", icon: "eye", rarity: ItemRarity.Rare, slot: ItemSlot.Accessory, value: 3500, lockCondition: { type: ConditionType.TasksCompleted, value: 30, description: "Complete 30 Tasks" }, modifiers: { damageBonus: 0.1 } },
	{ id: "kings-seal", name: "King's Seal", description: "+20% GP Gain.", icon: "crown", rarity: ItemRarity.Rare, slot: ItemSlot.Accessory, value: 4000, lockCondition: { type: ConditionType.AttrCha, value: 15, description: "Requires 15 CHA" }, modifiers: { gpBonus: 0.2, cha: 10 } },
	{ id: "phoenix-feather", name: "Phoenix Feather", description: "+50 HP, Auto-regen.", icon: "🔥", rarity: ItemRarity.Epic, slot: ItemSlot.Accessory, value: 12000, lockCondition: { type: ConditionType.Level, value: 20, description: "Requires Level 20" }, modifiers: { hpMax: 50, hpRegen: 5 } },
	{ id: "eye-of-the-storm", name: "Eye of the Storm", description: "All Attributes +10.", icon: "👁️", rarity: ItemRarity.Legendary, slot: ItemSlot.Accessory, value: 30000, lockCondition: { type: ConditionType.BossesDefeated, value: 15, description: "Defeat 15 Bosses" }, modifiers: { str: 10, int: 10, wis: 10, cha: 10 } },

	
	// --- SEALED / ENDGAME GEAR ---
	{ 
		id: "crown-ascendant", name: "Crown of the Ascendant", description: "Worn by those who conquered mortality. +20% All Stats.", 
		icon: "👑", rarity: ItemRarity.Legendary, slot: ItemSlot.Armor, value: 50000, 
		modifiers: { str: 20, int: 20, wis: 20, cha: 20, hpMax: 500, xpBonus: 0.5 },
		lockCondition: { type: ConditionType.Level, value: 50, description: "Requires Level 50 to unlock" }
	},
	{ 
		id: "demons-heart", name: "Demon's Heart", description: "Beating with raw, untamed power. +50% Boss DMG.", 
		icon: "❤️‍🔥", rarity: ItemRarity.Epic, slot: ItemSlot.Accessory, value: 20000, 
		modifiers: { damageBonus: 0.5, hpRegen: 15 },
		lockCondition: { type: ConditionType.BossesDefeated, value: 5, description: "Defeat 5 Bosses to unseal" }
	},
	{ 
		id: "tome-endless", name: "Tome of Endless Thoughts", description: "Knowledge unbound. +30% XP.", 
		icon: "📖", rarity: ItemRarity.Legendary, slot: ItemSlot.Accessory, value: 15000, 
		modifiers: { xpBonus: 0.3, int: 25 },
		lockCondition: { type: ConditionType.AttrInt, value: 20, description: "Requires INT Level 20" }
	},
	{ 
		id: "unyielding-seal", name: "Seal of the Unyielding", description: "+50% DMG Reduction, +300 HP.", 
		icon: "🛡️", rarity: ItemRarity.Epic, slot: ItemSlot.Accessory, value: 18000, 
		modifiers: { damageReduction: 0.5, hpMax: 300, wisdomSave: 0.5 },
		lockCondition: { type: ConditionType.AttrWis, value: 25, description: "Requires WIS Level 25" }
	},
	{ 
		id: "gilded-mirror", name: "Gilded Mirror of Vanity", description: "+50% GP Gain, +30 CHA.", 
		icon: "🪞", rarity: ItemRarity.Epic, slot: ItemSlot.Accessory, value: 22000, 
		modifiers: { gpBonus: 0.5, cha: 30 },
		lockCondition: { type: ConditionType.AttrCha, value: 20, description: "Requires CHA Level 20" }
	},
	{ 
		id: "abyssal-blade", name: "Abyssal Greatblade", description: "Heavy and destructive. +40 STR.", 
		icon: "🗡️", rarity: ItemRarity.Legendary, slot: ItemSlot.Weapon, value: 35000, 
		modifiers: { str: 40, damageBonus: 0.4 },
		lockCondition: { type: ConditionType.AttrStr, value: 30, description: "Requires STR Level 30" }
	},

	// --- CONSUMABLES ---
	{ 
		id: "minor-health-potion", name: "Minor Health Potion", description: "Heals 25 HP.", 
		icon: "🧪", rarity: ItemRarity.Common, slot: ItemSlot.Consumable, value: 25, 
		modifiers: {},
		consumableEffect: { type: "heal", value: 25 }
	},
	{ 
		id: "greater-health-potion", name: "Greater Health Potion", description: "Heals 75 HP.", 
		icon: "🧪", rarity: ItemRarity.Uncommon, slot: ItemSlot.Consumable, value: 60, 
		modifiers: {},
		consumableEffect: { type: "heal", value: 75 }
	},
	{ 
		id: "spirit-of-haste", name: "Spirit of Haste", description: "Increases Daily Energy Cap by 10 for today.", 
		icon: "🌩️", rarity: ItemRarity.Rare, slot: ItemSlot.Consumable, value: 100, 
		modifiers: {},
		consumableEffect: { type: "energy_boost", value: 10 }
	},
	{ 
		id: "streak-seal", name: "Streak Seal", description: "Protects one missed habit day.", 
		icon: "❄️", rarity: ItemRarity.Rare, slot: ItemSlot.Consumable, value: 150, 
		modifiers: {},
		consumableEffect: { type: "streak_freeze", value: 1 }
	},
	{ 
		id: "mirror-of-rebirth-item", name: "Mirror of Rebirth", description: "Reset all skill points.", 
		icon: "🪞", rarity: ItemRarity.Epic, slot: ItemSlot.Consumable, value: 300, 
		modifiers: {},
		consumableEffect: { type: "respec", value: 1 }
	}
];

// ---------------------------------------------------------------------------
// Dungeon Templates
// ---------------------------------------------------------------------------

export const DUNGEON_TEMPLATES = [
	{
		id: "noobs-cave",
		name: "Noob's Cave",
		icon: "🏔️",
		stages: [
			{ name: "Entrance", description: "A dark opening. Something skitters in the shadows.", tasksRequired: 2 },
			{ name: "Deep Tunnel", description: "Echoes of rodents and dripping water.", tasksRequired: 3 }
		],
		bossTemplate: BOSS_TEMPLATES[1] // Distraction Imp
	},
	{
		id: "shadow-tower",
		name: "Shadow Tower",
		icon: "🏰",
		stages: [
			{ name: "Foyer", description: "Dusty and cold. Old banners line the walls.", tasksRequired: 5 },
			{ name: "Spiral Stairs", description: "Each step groans beneath your weight.", tasksRequired: 5 },
			{ name: "Top Floor", description: "Wind howls through broken windows.", tasksRequired: 5 }
		],
		bossTemplate: BOSS_TEMPLATES[2] // Burnout Lich
	},
	{
		id: "sunken-library",
		name: "The Sunken Library",
		icon: "📚",
		stages: [
			{ name: "Flooded Hall", description: "Ankle-deep water covers ancient mosaics.", tasksRequired: 4 },
			{ name: "Forbidden Stacks", description: "Books whisper secrets from sealed shelves.", tasksRequired: 6 },
			{ name: "The Archive", description: "A vast chamber of forgotten knowledge.", tasksRequired: 4 },
			{ name: "The Vault", description: "A sealed door etched with glowing runes.", tasksRequired: 3 }
		],
		bossTemplate: BOSS_TEMPLATES[5] // Perfectionism Golem
	},
	{
		id: "chaos-rift",
		name: "The Chaos Rift",
		icon: "🌀",
		stages: [
			{ name: "Rift Mouth", description: "Reality tears at the edges of perception.", tasksRequired: 3 },
			{ name: "Shifting Halls", description: "Corridors rearrange themselves endlessly.", tasksRequired: 5 },
			{ name: "The Core", description: "Pure chaos. Finish tasks to stabilize.", tasksRequired: 7 }
		],
		bossTemplate: BOSS_TEMPLATES[3] // Chaos Goblin
	},
	{
		id: "dragons-lair",
		name: "Dragon's Lair",
		icon: "🐲",
		stages: [
			{ name: "Mountain Pass", description: "The air grows thin. Scorched earth lines the trail.", tasksRequired: 5 },
			{ name: "Bone Garden", description: "Remains of past challengers.", tasksRequired: 5 },
			{ name: "Treasure Hoard", description: "Mountains of gold — but the dragon stirs.", tasksRequired: 5 },
			{ name: "The Roost", description: "The final ascent. No turning back.", tasksRequired: 8 }
		],
		bossTemplate: BOSS_TEMPLATES[0] // Procrastination Dragon
	}
];

/**
 * Generate unique IDs
 */
export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

