// ============================================================================
// Life RPG — Game Engine
// Pure calculation functions for XP, GP, HP, leveling, and combat.
// All functions are side-effect free and return new state objects.
// ============================================================================

import {
	type Skill,
	type PluginSettings,
	type EventLogEntry,
	type RewardResult,
	type TaskMetadata,
	type CharacterAttributes,
	type AttributeState,
	type CharacterState,
	type Item,
	type SkillTreeNode,
	Difficulty,
	EventType,
} from "../types";
import {
	xpThresholdForLevel,
	xpThresholdForSkillLevel,
	generateId,
} from "../constants";
import { getRankUpTitle } from "./ClassSystem";

// ---------------------------------------------------------------------------
// Item & Equipment Modifiers
// ---------------------------------------------------------------------------

export function calculateGlobalModifiers(
	character: CharacterState,
	inventory: Item[],
	unlockedNodes: string[],
	allSkillNodes: SkillTreeNode[]
) {
	const total = {
		str: 0,
		int: 0,
		wis: 0,
		cha: 0,
		hpMax: 0,
		xpMultiplier: 1.0,
		gpMultiplier: 1.0,
		damageBonus: 0,
		damageReduction: 0,
		wisdomSave: 0, // Reduces bad habit damage
		dropChance: 0,
		// Energy system flags
		isBurntOut: character.burntOutYesterday || false,
	};

	// 1. Item Modifiers
	const equippedItems = Object.values(character.equippedItems)
		.map(id => inventory.find(i => i.id === id) || null);

	for (const item of equippedItems) {
		if (!item) continue;
		total.str += item.modifiers.str || 0;
		total.int += item.modifiers.int || 0;
		total.wis += item.modifiers.wis || 0;
		total.cha += item.modifiers.cha || 0;
		total.hpMax += item.modifiers.hpMax || 0;
		total.xpMultiplier += item.modifiers.xpBonus || 0;
		total.gpMultiplier += item.modifiers.gpBonus || 0;
		total.damageBonus += item.modifiers.damageBonus || 0;
		total.damageReduction += item.modifiers.damageReduction || 0;
	}

	// 2. Skill tree modifiers
	for (const nodeId of unlockedNodes) {
		const node = allSkillNodes.find(n => n.id === nodeId);
		if (!node) continue;
		total.hpMax += node.modifiers.hpMax || 0;
		total.xpMultiplier += node.modifiers.xpMultiplier || 0;
		total.gpMultiplier += node.modifiers.gpMultiplier || 0;
		total.damageBonus += node.modifiers.damageBonus || 0;
		total.wisdomSave += node.modifiers.wisdomSave || 0;
		total.dropChance += node.modifiers.dropChance || 0;
	}

	// 3. Burnout Debuff: -25% XP gain
	if (total.isBurntOut) {
		total.xpMultiplier *= 0.75;
	}

	return total;
}

// ---------------------------------------------------------------------------
// Task Reward Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate XP and GP rewards for completing a task.
 * Formula: base * energyMultiplier
 * energyMultiplier = (M + P + W) / 5
 */
export function calculateTaskReward(
	metadata: TaskMetadata,
	settings: PluginSettings,
	attributes: CharacterAttributes,
	globalModifiers: ReturnType<typeof calculateGlobalModifiers>,
	isSubtask?: boolean,
	parentIsHeading: boolean = false,
	comboCount: number = 0
): { xp: number; gp: number } {
	// 0. Headings award no inherent rewards
	if (metadata.isHeading) {
		return { xp: 0, gp: 0 };
	}

	// 1. Calculate Multipliers
	const diffMult = settings.difficultyMultipliers[metadata.difficulty] ?? 1;
	
	let energyMult = 1.0;
	const hasEnergy = (metadata.energyM !== undefined || metadata.energyP !== undefined || metadata.energyW !== undefined);

	if (hasEnergy) {
		const weights = settings.energyWeights || { mental: 0.2, physical: 0.2, willpower: 0.2 };
		
		// Validate and normalize weights to prevent balance-breaking values
		const totalWeight = weights.mental + weights.physical + weights.willpower;
		const normalizedWeights = totalWeight > 0 ? {
			mental: weights.mental / totalWeight,
			physical: weights.physical / totalWeight,
			willpower: weights.willpower / totalWeight
		} : { mental: 0.333, physical: 0.333, willpower: 0.334 };
		
		const rawEnergy = (
			(metadata.energyM || 0) * normalizedWeights.mental +
			(metadata.energyP || 0) * normalizedWeights.physical +
			(metadata.energyW || 0) * normalizedWeights.willpower
		);
		
		// Cap at 3.0 (same as max difficulty multiplier: Madhouse)
		// Max energy input is 5+5+5=15 points, normalized by equal weights gives max 5.0,
		// then capped at 3.0 to prevent balance-breaking multipliers
		energyMult = Math.min(3.0, rawEnergy);
	}

	const multiplier = diffMult * energyMult;
	
	// Base calculations
	let xp = settings.baseXp * multiplier;
	let gp = settings.baseGp * multiplier;

	// Apply Attribute Modifiers
	// INT boosts XP by 2% per EFFECTIVE level
	const intBonus = 1 + ((attributes.int.level + globalModifiers.int) * 0.02);
	xp *= intBonus;
	xp *= globalModifiers.xpMultiplier;

	// CHA boosts GP by 3% per EFFECTIVE level
	const chaBonus = 1 + ((attributes.cha.level + globalModifiers.cha) * 0.03);
	gp *= chaBonus;
	gp *= globalModifiers.gpMultiplier;

	// Combo Bonus: +5% per combo hit (max 50%)
	const comboBonus = 1 + Math.min(0.5, (comboCount * 0.05));
	xp *= comboBonus;
	gp *= comboBonus;

	return {
		xp: Math.round(xp),
		gp: Math.round(gp),
	};
}

/**
 * Calculate XP and GP for a habit action.
 */
export function calculateHabitReward(
	habit: any, // Habit interface but flexible for internal use
	settings: PluginSettings,
	attributes: CharacterAttributes,
	globalModifiers: ReturnType<typeof calculateGlobalModifiers>
): { xp: number; gp: number; hpDamage: number } {
	// 1. Calculate Multipliers
	const diffMult = settings.difficultyMultipliers[habit.difficulty as Difficulty] ?? 1;

	let energyMult = 1.0;
	const hasEnergy = (habit.energyM !== undefined || habit.energyP !== undefined || habit.energyW !== undefined);

	if (hasEnergy) {
		const weights = settings.energyWeights || { mental: 0.2, physical: 0.2, willpower: 0.2 };
		
		// Validate and normalize weights to prevent balance-breaking values
		const totalWeight = weights.mental + weights.physical + weights.willpower;
		const normalizedWeights = totalWeight > 0 ? {
			mental: weights.mental / totalWeight,
			physical: weights.physical / totalWeight,
			willpower: weights.willpower / totalWeight
		} : { mental: 0.333, physical: 0.333, willpower: 0.334 };
		
		const rawEnergy = (
			(habit.energyM || 0) * normalizedWeights.mental +
			(habit.energyP || 0) * normalizedWeights.physical +
			(habit.energyW || 0) * normalizedWeights.willpower
		);
		
		// Cap at 3.0 (same as max difficulty multiplier: Madhouse)
		energyMult = Math.min(3.0, rawEnergy);
	}

	const multiplier = diffMult * energyMult;

	if (habit.type === "good") {
		let xp = settings.baseXp * multiplier;
		let gp = settings.baseGp * multiplier * 0.5; // Habits give 50% GP

		const intBonus = 1 + ((attributes.int.level + globalModifiers.int) * 0.02);
		xp *= intBonus;
		xp *= globalModifiers.xpMultiplier;

		const chaBonus = 1 + ((attributes.cha.level + globalModifiers.cha) * 0.03);
		gp *= chaBonus;
		gp *= globalModifiers.gpMultiplier;

		return {
			xp: Math.round(xp),
			gp: Math.round(gp),
			hpDamage: 0,
		};
	} else {
		// --- Bad Habit Scaling ---
		// Base damage scales with average attribute level (consistent with boss logic)
		// Average = (STR + INT + WIS + CHA) / 4 gives a smooth, predictable progression
		const avgAttrLevel = (attributes.str.level + attributes.int.level + attributes.wis.level + attributes.cha.level) / 4;
		const levelScaling = 1 + (avgAttrLevel * 0.1); // Bad habits get 10% harder per avg attribute level
		
		let hpDamage = 5 * multiplier * levelScaling;
		
		// WIS reduces damage by 2% per effective level (max 90% reduction)
		const rawReduction = ((attributes.wis.level + globalModifiers.wis) * 0.02) + globalModifiers.damageReduction + globalModifiers.wisdomSave;
		
		// Resistance Piercing: At higher levels, penalties "pierce" your wisdom
		// Up to 50% of your reduction can be bypassed based on total attribute investment
		const totalAttrPoints = (attributes.str.level + attributes.int.level + attributes.wis.level + attributes.cha.level);
		const piercing = Math.min(0.5, totalAttrPoints * 0.005); // Up to 50% piercing
		const effectiveReduction = Math.min(0.9, rawReduction * (1 - piercing));
		
		hpDamage *= (1 - effectiveReduction);

		return {
			xp: 0,
			gp: 0,
			hpDamage: Math.round(hpDamage),
		};
	}
}

// ---------------------------------------------------------------------------
// XP Processing & Level Up
// ---------------------------------------------------------------------------

/**
 * Process an XP gain on the character. Handles cascading level-ups.
 */
export function processXpGain(
	character: CharacterState,
	xpAmount: number,
	hpPerLevel: number,
	globalModifiers?: { hpMax: number }
): { character: CharacterState; logEntries: EventLogEntry[]; leveledUp: boolean } {
	const char = { ...character };
	const logEntries: EventLogEntry[] = [];
	let leveledUp = false;

	char.xp += xpAmount;

	// Cascading level-ups
	while (char.xp >= char.xpToNextLevel) {
		char.xp -= char.xpToNextLevel;
		char.level++;
		char.maxHp += hpPerLevel;
		const finalMaxHp = char.maxHp + (globalModifiers?.hpMax || 0);
		char.hp = finalMaxHp; // Full heal on level up
		char.xpToNextLevel = xpThresholdForLevel(char.level);
		leveledUp = true;

		const rankTitle = getRankUpTitle(char.level, char.classId);
		let message = `🎉 LEVEL UP! You are now Level ${char.level}! Max HP increased to ${char.maxHp}.`;
		if (rankTitle) {
			message = `🎉 LEVEL UP! You reached Level ${char.level} and earned the rank of **${rankTitle}**!`;
		}

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.LevelUp,
			message,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: char.maxHp - character.maxHp,
		});
	}

	return { character: char, logEntries, leveledUp };
}

/**
 * Process an XP gain on a skill. Handles cascading skill level-ups.
 */
export function processSkillXpGain(
	skill: Skill,
	xpAmount: number
): { skill: Skill; logEntries: EventLogEntry[]; leveledUp: boolean; spEarned: number } {
	const s = { ...skill };
	const logEntries: EventLogEntry[] = [];
	let leveledUp = false;
	let spEarned = 0;

	s.xp += xpAmount;

	while (s.xp >= s.xpToNextLevel) {
		s.xp -= s.xpToNextLevel;
		s.level++;
		s.xpToNextLevel = xpThresholdForSkillLevel(s.level);
		leveledUp = true;
		spEarned++;

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillUp,
			message: `⬆️ ${s.icon} ${s.name} leveled up to Level ${s.level}! (Earned 1 Skill Point)`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	return { skill: s, logEntries, leveledUp, spEarned };
}

/**
 * Revert an XP gain on the character. Handles cascading level-downs.
 * Returns the new character state and log entries.
 */
export function revertXpGain(
	character: CharacterState,
	xpAmount: number,
	hpPerLevel: number,
	globalModifiers?: { hpMax: number }
): { character: CharacterState; logEntries: EventLogEntry[]; leveledDown: boolean } {
	const char = { ...character };
	const logEntries: EventLogEntry[] = [];
	let leveledDown = false;

	char.xp -= xpAmount;

	// Cascading level-downs
	while (char.xp < 0 && char.level > 1) {
		char.level--;
		// Calculate effective HP loss matching level-up logic for consistency
		const effectiveHpLoss = globalModifiers 
			? globalModifiers.hpMax + hpPerLevel
			: hpPerLevel;
		char.maxHp = Math.max(10, char.maxHp - effectiveHpLoss);
		
		// Adjust current HP if it exceeds new max (ensuring final value is safe)
		const modifierBonus = Math.max(0, globalModifiers?.hpMax || 0); // Never let modifiers go negative
		const finalMaxHp = char.maxHp + modifierBonus;
		if (char.hp > finalMaxHp) char.hp = finalMaxHp;
		
		char.xpToNextLevel = xpThresholdForLevel(char.level);
		char.xp += char.xpToNextLevel;
		leveledDown = true;

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.LevelUp, // Reusing LevelUp for now, maybe need LevelDown event type later
			message: `📉 LEVEL DOWN! You are now Level ${char.level}. Max HP decreased to ${char.maxHp}.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: char.hp - character.hp,
		});
	}

	if (char.xp < 0) {
		char.xp = 0; // Don't drop below 0 if player is level 1
	}

	return { character: char, logEntries, leveledDown };
}

/**
 * Revert an XP gain on a skill. Handles cascading skill level-downs.
 */
export function revertSkillXpGain(
	skill: Skill,
	xpAmount: number
): { skill: Skill; logEntries: EventLogEntry[]; leveledDown: boolean } {
	const s = { ...skill };
	const logEntries: EventLogEntry[] = [];
	let leveledDown = false;

	s.xp -= xpAmount;

	while (s.xp < 0 && s.level > 1) {
		s.level--;
		s.xpToNextLevel = xpThresholdForSkillLevel(s.level);
		s.xp += s.xpToNextLevel;
		leveledDown = true;

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillUp,
			message: `⬇️ ${s.icon} ${s.name} leveled down to Level ${s.level}.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	if (s.xp < 0) {
		s.xp = 0;
	}

	return { skill: s, logEntries, leveledDown };
}

/**
 * Process an XP gain on an attribute. Handles cascading level-ups.
 */
export function processAttributeXpGain(
	attributeName: string,
	attributeState: AttributeState,
	xpAmount: number
): { attribute: AttributeState; logEntries: EventLogEntry[]; leveledUp: boolean } {
	const s = { ...attributeState };
	const logEntries: EventLogEntry[] = [];
	let leveledUp = false;

	s.xp += xpAmount;

	while (s.xp >= s.xpToNextLevel) {
		s.xp -= s.xpToNextLevel;
		s.level++;
		s.xpToNextLevel = xpThresholdForSkillLevel(s.level); // Reuse skill threshold
		leveledUp = true;

		// Convert attribute shortname to display
		const displayMap: Record<string, string> = {
			str: '🦾 Strength',
			int: '🧠 Intelligence',
			wis: '🫀 Wisdom',
			cha: '👑 Charisma'
		};

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillUp, // Reusing SkillUp type
			message: `✨ ${displayMap[attributeName.toLowerCase()] || attributeName} leveled up to Level ${s.level}!`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	return { attribute: s, logEntries, leveledUp };
}

/**
 * Revert an XP gain on an attribute.
 */
export function revertAttributeXpGain(
	attributeName: string,
	attributeState: AttributeState,
	xpAmount: number
): { attribute: AttributeState; logEntries: EventLogEntry[]; leveledDown: boolean } {
	const s = { ...attributeState };
	const logEntries: EventLogEntry[] = [];
	let leveledDown = false;

	s.xp -= xpAmount;

	while (s.xp < 0 && s.level > 1) {
		s.level--;
		s.xpToNextLevel = xpThresholdForSkillLevel(s.level);
		s.xp += s.xpToNextLevel;
		leveledDown = true;

		const displayMap: Record<string, string> = {
			str: '🦾 Strength',
			int: '🧠 Intelligence',
			wis: '🫀 Wisdom',
			cha: '👑 Charisma'
		};

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillUp,
			message: `📉 ${displayMap[attributeName.toLowerCase()] || attributeName} leveled down to Level ${s.level}.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	if (s.xp < 0) s.xp = 0;

	return { attribute: s, logEntries, leveledDown };
}

// ---------------------------------------------------------------------------
// HP Processing
// ---------------------------------------------------------------------------

/**
 * Apply HP damage to the character. Clamps to minimum 0.
 */
export function processHpDamage(
	character: CharacterState,
	amount: number,
	actualHpGain: number = 10,
	globalModifiers?: { hpMax: number }
): { character: CharacterState; logEntries: EventLogEntry[]; died: boolean } {
	const logEntries: EventLogEntry[] = [];
	let c = { ...character };
	c.hp -= amount;
	let died = false;

	if (c.hp <= 0) {
		died = true;
		c.xp = 0;
		c.gp = 0;
		
		// Apply level down penalty - use same logic as revertXpGain for consistency
		if (c.level > 1) {
			c.level--;
			// Calculate effective HP change (same formula as level-up, just negative)
			const effectiveHpLoss = globalModifiers 
				? globalModifiers.hpMax + actualHpGain
				: actualHpGain;
			c.maxHp = Math.max(10, c.maxHp - effectiveHpLoss);
			c.xpToNextLevel = xpThresholdForLevel(c.level);
		}
		
		// Refill to NEW Max HP (includes modifiers)
		const finalMaxHp = c.maxHp + (globalModifiers?.hpMax || 0);
		c.hp = finalMaxHp;
		
		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.BossDamageTaken, // Reusing damage type for death
			message: `💀 YOU DIED! Level dropped, and all XP/Gold was lost. HP fully restored.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	return { character: c, logEntries, died };
}

/**
 * Apply HP regeneration to the character. Clamps to maxHp.
 */
export function processHpRegen(
	character: CharacterState,
	amount: number,
	globalModifiers?: { hpMax: number }
): CharacterState {
	const finalMaxHp = character.maxHp + (globalModifiers?.hpMax || 0);
	return {
		...character,
		hp: Math.min(finalMaxHp, character.hp + amount),
	};
}

// ---------------------------------------------------------------------------
// GP Processing
// ---------------------------------------------------------------------------

/**
 * Add gold to the character.
 */
export function processGpGain(
	character: CharacterState,
	amount: number
): CharacterState {
	return {
		...character,
		gp: character.gp + amount,
	};
}

/**
 * Attempt to spend gold. Returns null if insufficient funds.
 */
export function processGpSpend(
	character: CharacterState,
	cost: number
): CharacterState | null {
	if (character.gp < cost) return null;
	return {
		...character,
		gp: character.gp - cost,
	};
}

// ---------------------------------------------------------------------------
// Full Task Completion Flow
// ---------------------------------------------------------------------------

/**
 * Process a full task completion, including XP, GP, skill XP, and level-ups.
 */
export function processTaskCompletion(
	character: CharacterState,
	skills: Skill[],
	metadata: TaskMetadata,
	taskText: string,
	settings: PluginSettings,
	globalModifiers: ReturnType<typeof calculateGlobalModifiers>,
	isSubtask: boolean,
	parentIsHeading: boolean = false,
	comboCount: number = 0
): {
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	result: RewardResult & { spEarned: number };
} {
	const reward = calculateTaskReward(metadata, settings, character.attributes, globalModifiers, isSubtask, parentIsHeading, comboCount);
	const logEntries: EventLogEntry[] = [];
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));
	let spEarned = 0;

	// 1. Award GP
	currentChar = processGpGain(currentChar, reward.gp);

	// 2. Process character XP (may trigger level-up)
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * 10);
	
	const xpResult = processXpGain(currentChar, reward.xp, actualHpGain);
	currentChar = xpResult.character;
	logEntries.push(...xpResult.logEntries);

	// 3. Process skill and attribute XP if a skill is specified
	let skillLeveledUp = false;
	let skillName: string | null = null;
	let newSkillLevel = 0;

	if (metadata.skillId) {
		const skillIdx = updatedSkills.findIndex(
			(s) =>
				s.id === metadata.skillId ||
				s.name.toLowerCase() === metadata.skillId!.toLowerCase()
		);
		if (skillIdx !== -1) {
			const skillRef = updatedSkills[skillIdx];
			const skillResult = processSkillXpGain(skillRef, reward.xp);
			updatedSkills[skillIdx] = skillResult.skill;
			logEntries.push(...skillResult.logEntries);
			skillLeveledUp = skillResult.leveledUp;
			skillName = skillResult.skill.name;
			newSkillLevel = skillResult.skill.level;
			spEarned = skillResult.spEarned;

			// Level the corresponding attribute
			if (skillRef.attribute) {
				const attrObj = currentChar.attributes[skillRef.attribute];
				if (attrObj) {
					const ratio = settings.skillToAttributeRatio ?? 0.2;
					const attrXp = Math.round(reward.xp * ratio);
					const attrResult = processAttributeXpGain(skillRef.attribute, attrObj, attrXp);
					currentChar.attributes[skillRef.attribute] = attrResult.attribute;
					logEntries.push(...attrResult.logEntries);
				}
			}
		}
	}

	// 4. Create the task completion log entry
	const diffLabels: Record<Difficulty, string> = {
		[Difficulty.Passive]: "Passive",
		[Difficulty.Easy]: "Easy",
		[Difficulty.Challenging]: "Challenging",
		[Difficulty.Hardcore]: "Hardcore",
		[Difficulty.Madhouse]: "Madhouse"
	};
	const diffLabel = diffLabels[metadata.difficulty] || "Unknown";

	logEntries.unshift({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.TaskComplete,
		message: `✅ Completed: "${taskText}" [${diffLabel}] → +${reward.xp} XP, +${reward.gp} GP${skillName ? ` (${skillName})` : ""}`,
		xpDelta: reward.xp,
		gpDelta: reward.gp,
		hpDelta: 0,
	});

	return {
		character: currentChar,
		skills: updatedSkills,
		logEntries,
		result: {
			xp: reward.xp,
			gp: reward.gp,
			leveledUp: xpResult.leveledUp,
			newLevel: currentChar.level,
			skillLeveledUp,
			skillName,
			newSkillLevel,
			spEarned,
		},
	};
}

/**
 * Process a full task UN-completion, reverting XP, GP, and level-ups.
 */
export function processTaskUncompletion(
	character: CharacterState,
	skills: Skill[],
	metadata: TaskMetadata,
	settings: PluginSettings,
	globalModifiers: ReturnType<typeof calculateGlobalModifiers>,
	isSubtask: boolean,
	taskText: string,
	parentIsHeading: boolean = false,
	comboCount: number = 0
): {
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	result: RewardResult & { spEarned: number };
} {
	const reward = calculateTaskReward(metadata, settings, character.attributes, globalModifiers, isSubtask, parentIsHeading, comboCount);
	const logEntries: EventLogEntry[] = [];
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));
	let spLost = 0;

	// 1. Revert GP
	let gpLoss = reward.gp;
	if (currentChar.gp - gpLoss < 0) gpLoss = currentChar.gp;
	currentChar.gp -= gpLoss;

	// 2. Process character XP revert
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * 10);
	const xpResult = revertXpGain(currentChar, reward.xp, actualHpGain);
	currentChar = xpResult.character;
	logEntries.push(...xpResult.logEntries);

	// 3. Process skill XP revert
	let skillLeveledDown = false;
	let skillName: string | null = null;
	let newSkillLevel = 0;

	if (metadata.skillId) {
		const skillIdx = updatedSkills.findIndex(s => s.id === metadata.skillId || s.name.toLowerCase() === metadata.skillId!.toLowerCase());
		if (skillIdx !== -1) {
			const skillRef = updatedSkills[skillIdx];
			const skillResult = revertSkillXpGain(skillRef, reward.xp);
			updatedSkills[skillIdx] = skillResult.skill;
			logEntries.push(...skillResult.logEntries);
			skillLeveledDown = skillResult.leveledDown;
			skillName = skillResult.skill.name;
			newSkillLevel = skillResult.skill.level;
			if (skillResult.leveledDown) spLost = 1; // Assuming 1 SP per level

			// Revert attribute
			if (skillRef.attribute) {
				const attrObj = currentChar.attributes[skillRef.attribute];
				if (attrObj) {
					const ratio = settings.skillToAttributeRatio ?? 0.2;
					const attrXp = Math.round(reward.xp * ratio);
					const attrResult = revertAttributeXpGain(skillRef.attribute, attrObj, attrXp);
					currentChar.attributes[skillRef.attribute] = attrResult.attribute;
					logEntries.push(...attrResult.logEntries);
				}
			}
		}
	}

	logEntries.unshift({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.TaskComplete,
		message: `❌ Unchecked: "${taskText}" → -${reward.xp} XP, -${gpLoss} GP${skillName ? ` (${skillName})` : ""}`,
		xpDelta: -reward.xp,
		gpDelta: -gpLoss,
		hpDelta: 0,
	});

	return {
		character: currentChar,
		skills: updatedSkills,
		logEntries,
		result: {
			xp: -reward.xp,
			gp: -gpLoss,
			leveledUp: xpResult.leveledDown,
			newLevel: currentChar.level,
			skillLeveledUp: skillLeveledDown,
			skillName,
			newSkillLevel,
			spEarned: -spLost,
		},
	};
}

// ---------------------------------------------------------------------------
// Boss Combat
// ---------------------------------------------------------------------------

/**
 * Deal damage to a boss. Returns updated boss and whether it was defeated.
 */
export function dealDamageToBoss(
	bossHp: number,
	bossMaxHp: number,
	damage: number
): { newHp: number; defeated: boolean } {
	const newHp = Math.max(0, bossHp - damage);
	return { newHp, defeated: newHp <= 0 };
}

/**
 * Calculate boss damage to deal to the player.
 * Scales with boss attack power and is reduced by WIS and gear.
 */
export function calculateBossAttackDamage(
	attackPower: number,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): number {
	// WIS reduces boss damage by 1% per level (max 75% reduction)
	const rawReduction = ((attributes.wis.level + modifiers.wis) * 0.01) + modifiers.damageReduction;
	
	// NEW: Resistance Piercing
	// Bosses ignore a percentage of your total reduction based on your level/strength
	// Formula: pierces 1% per 2 attribute points (max 50%)
	const totalPoints = attributes.str.level + attributes.int.level + attributes.wis.level + attributes.cha.level;
	const piercing = Math.min(0.5, totalPoints * 0.005);
	
	const effectiveReduction = Math.min(0.75, rawReduction * (1 - piercing));
	
	return Math.round(attackPower * (1 - effectiveReduction));
}

// ---------------------------------------------------------------------------
// Streak Calculations
// ---------------------------------------------------------------------------

/**
 * Check if a streak should be maintained or reset.
 * A streak is maintained if the last completion was yesterday or today.
 */
export function checkStreakContinuity(
	lastCompleted: string | null,
	today: Date
): boolean {
	if (!lastCompleted) return false;

	const last = new Date(lastCompleted);
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	return (
		last.toDateString() === today.toDateString() ||
		last.toDateString() === yesterday.toDateString()
	);
}

/**
 * Calculate streak bonus multiplier.
 * Every 7 consecutive days adds 0.1x bonus (max 2.0x at 70+ days).
 */
export function streakBonusMultiplier(streak: number): number {
	const bonus = Math.floor(streak / 7) * 0.1;
	return Math.min(2.0, 1.0 + bonus);
}
