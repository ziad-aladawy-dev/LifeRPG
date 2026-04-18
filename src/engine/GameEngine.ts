// ============================================================================
// Life RPG — Game Engine
// Pure calculation functions for XP, GP, HP, leveling, and combat.
// All functions are side-effect free and return new state objects.
// ============================================================================

import {
	type CharacterState,
	type Skill,
	type PluginSettings,
	type EventLogEntry,
	type RewardResult,
	type TaskMetadata,
	type CharacterAttributes,
	type AttributeState,
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
// Task Reward Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate XP and GP rewards for completing a task.
 * Formula: base * difficultyMultiplier
 */
export function calculateTaskReward(
	difficulty: Difficulty,
	settings: PluginSettings,
	attributes?: CharacterAttributes, // Optional for backward-compat or pure base checks
	isSubtask?: boolean
): { xp: number; gp: number } {
	const multiplier = settings.difficultyMultipliers[difficulty] ?? 1;
	
	// Base calculations
	let xp = settings.baseXp * multiplier;
	let gp = settings.baseGp * multiplier;

	// Apply Attribute Modifiers
	if (attributes) {
		// INT boosts XP by 2% per level
		const intBonus = 1 + (attributes.int.level * 0.02);
		xp *= intBonus;

		// CHA boosts GP by 3% per level
		const chaBonus = 1 + (attributes.cha.level * 0.03);
		gp *= chaBonus;
	}

	// Apply Subtask Penalty (25% yield)
	if (isSubtask) {
		xp *= 0.25;
		gp *= 0.25;
	}

	return {
		xp: Math.round(xp),
		gp: Math.round(gp),
	};
}

/**
 * Calculate XP and GP for a habit action.
 * Good habits: positive XP/GP based on difficulty
 * Bad habits: HP penalty based on difficulty
 */
export function calculateHabitReward(
	type: "good" | "bad",
	difficulty: Difficulty,
	settings: PluginSettings,
	attributes?: CharacterAttributes
): { xp: number; gp: number; hpDamage: number } {
	const multiplier = settings.difficultyMultipliers[difficulty] ?? 1;
	if (type === "good") {
		let xp = settings.baseXp * multiplier;
		let gp = settings.baseGp * multiplier * 0.5; // Habits give 50% GP

		if (attributes) {
			xp *= 1 + (attributes.int.level * 0.02);
			gp *= 1 + (attributes.cha.level * 0.03);
		}

		return {
			xp: Math.round(xp),
			gp: Math.round(gp),
			hpDamage: 0,
		};
	} else {
		let hpDamage = 5 * multiplier; // Base 5 damage * multiplier
		if (attributes) {
			// CON reduces damage by 2% per level (max 90% reduction)
			const damageReduction = Math.min(0.9, attributes.wis.level * 0.02);
			hpDamage *= (1 - damageReduction);
		}

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
 * Returns the new character state and any log entries generated.
 */
export function processXpGain(
	character: CharacterState,
	xpAmount: number,
	hpPerLevel: number
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
		char.hp = char.maxHp; // Full heal on level up
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
 * Returns the new skill state and any log entries generated.
 */
export function processSkillXpGain(
	skill: Skill,
	xpAmount: number
): { skill: Skill; logEntries: EventLogEntry[]; leveledUp: boolean } {
	const s = { ...skill };
	const logEntries: EventLogEntry[] = [];
	let leveledUp = false;

	s.xp += xpAmount;

	while (s.xp >= s.xpToNextLevel) {
		s.xp -= s.xpToNextLevel;
		s.level++;
		s.xpToNextLevel = xpThresholdForSkillLevel(s.level);
		leveledUp = true;

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.SkillUp,
			message: `⬆️ ${s.icon} ${s.name} leveled up to Level ${s.level}!`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	return { skill: s, logEntries, leveledUp };
}

/**
 * Revert an XP gain on the character. Handles cascading level-downs.
 * Returns the new character state and log entries.
 */
export function revertXpGain(
	character: CharacterState,
	xpAmount: number,
	hpPerLevel: number
): { character: CharacterState; logEntries: EventLogEntry[]; leveledDown: boolean } {
	const char = { ...character };
	const logEntries: EventLogEntry[] = [];
	let leveledDown = false;

	char.xp -= xpAmount;

	// Cascading level-downs
	while (char.xp < 0 && char.level > 1) {
		char.level--;
		char.maxHp = Math.max(10, char.maxHp - hpPerLevel);
		// Note: when reverting XP gain, maxHp is correctly decreased here.
		if (char.hp > char.maxHp) char.hp = char.maxHp;
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
	actualHpGain: number = 10
): { character: CharacterState; logEntries: EventLogEntry[]; died: boolean } {
	const logEntries: EventLogEntry[] = [];
	let c = { ...character };
	c.hp -= amount;
	let died = false;

	if (c.hp <= 0) {
		died = true;
		c.hp = c.maxHp;
		c.xp = 0;
		c.gp = 0;
		if (c.level > 1) {
			c.level--;
			c.maxHp = Math.max(10, c.maxHp - actualHpGain);
			c.xpToNextLevel = xpThresholdForLevel(c.level);
		}
		
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
	amount: number
): CharacterState {
	return {
		...character,
		hp: Math.min(character.maxHp, character.hp + amount),
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
 * This is the main orchestrator called when a task checkbox is toggled.
 */
export function processTaskCompletion(
	character: CharacterState,
	skills: Skill[],
	metadata: TaskMetadata,
	taskText: string,
	settings: PluginSettings,
	isSubtask?: boolean
): {
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	result: RewardResult;
} {
	const reward = calculateTaskReward(metadata.difficulty, settings, character.attributes, isSubtask);
	const logEntries: EventLogEntry[] = [];
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));

	// 1. Award GP
	currentChar = processGpGain(currentChar, reward.gp);

	// 2. Process character XP (may trigger level-up)
	// CON applies to HP per level
	const wisBonus = 10; // Extra HP
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * wisBonus);
	
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
			// Level the skill
			const skillResult = processSkillXpGain(
				skillRef,
				reward.xp
			);
			updatedSkills[skillIdx] = skillResult.skill;
			logEntries.push(...skillResult.logEntries);
			skillLeveledUp = skillResult.leveledUp;
			skillName = skillResult.skill.name;
			newSkillLevel = skillResult.skill.level;

			// Level the corresponding attribute
			if (skillRef.attribute) {
				const attrObj = currentChar.attributes[skillRef.attribute];
				if (attrObj) {
					const attrResult = processAttributeXpGain(skillRef.attribute, attrObj, reward.xp);
					currentChar.attributes[skillRef.attribute] = attrResult.attribute;
					logEntries.push(...attrResult.logEntries);
				}
			}
		}
	}

	// 4. Create the task completion log entry
	const diffLabel =
		metadata.difficulty === Difficulty.Hard
			? "Hard"
			: metadata.difficulty === Difficulty.Medium
				? "Medium"
				: "Easy";

	logEntries.unshift({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.TaskComplete,
		message: `✅ Completed: "${taskText}" [${diffLabel}] → +${reward.xp} XP, +${reward.gp} GP${
			skillName ? ` (${skillName})` : ""
		}`,
		xpDelta: reward.xp,
		gpDelta: reward.gp,
		hpDelta: 0,
	});

	const result: RewardResult = {
		xp: reward.xp,
		gp: reward.gp,
		leveledUp: xpResult.leveledUp,
		newLevel: currentChar.level,
		skillLeveledUp,
		skillName,
		newSkillLevel,
	};

	return {
		character: currentChar,
		skills: updatedSkills,
		logEntries,
		result,
	};
}

/**
 * Process a full task UN-completion, reverting XP, GP, and level-ups.
 */
export function processTaskUncompletion(
	character: CharacterState,
	skills: Skill[],
	metadata: TaskMetadata,
	taskText: string,
	settings: PluginSettings,
	isSubtask?: boolean
): {
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	result: RewardResult;
} {
	const reward = calculateTaskReward(metadata.difficulty, settings, character.attributes, isSubtask);
	const logEntries: EventLogEntry[] = [];
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));

	// 1. Revert GP (don't go below 0)
	let gpLoss = reward.gp;
	if (currentChar.gp - gpLoss < 0) {
		gpLoss = currentChar.gp; // Can only lose what we have
	}
	currentChar.gp -= gpLoss;

	// 2. Process character XP revert
	const wisBonus = 10;
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * wisBonus);
	
	const xpResult = revertXpGain(currentChar, reward.xp, actualHpGain);
	currentChar = xpResult.character;
	logEntries.push(...xpResult.logEntries);

	// 3. Process skill XP revert if a skill is specified
	let skillLeveledDown = false;
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
			// Revert the skill
			const skillResult = revertSkillXpGain(
				skillRef,
				reward.xp
			);
			updatedSkills[skillIdx] = skillResult.skill;
			logEntries.push(...skillResult.logEntries);
			skillLeveledDown = skillResult.leveledDown;
			skillName = skillResult.skill.name;
			newSkillLevel = skillResult.skill.level;

			// Revert the corresponding attribute
			if (skillRef.attribute) {
				const attrObj = currentChar.attributes[skillRef.attribute];
				if (attrObj) {
					const attrResult = revertAttributeXpGain(skillRef.attribute, attrObj, reward.xp);
					currentChar.attributes[skillRef.attribute] = attrResult.attribute;
					logEntries.push(...attrResult.logEntries);
				}
			}
		}
	}

	// 4. Create the un-completion log entry
	logEntries.unshift({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.TaskComplete, // Reusing for the log
		message: `❌ Unchecked: "${taskText}" → -${reward.xp} XP, -${gpLoss} GP${
			skillName ? ` (${skillName})` : ""
		}`,
		xpDelta: -reward.xp,
		gpDelta: -gpLoss,
		hpDelta: 0,
	});

	const result: RewardResult = {
		xp: -reward.xp, // Reusing RewardResult to transport the neg delta
		gp: -gpLoss,
		leveledUp: xpResult.leveledDown, // Using leveledUp field for leveledDown state
		newLevel: currentChar.level,
		skillLeveledUp: skillLeveledDown,
		skillName,
		newSkillLevel,
	};

	return {
		character: currentChar,
		skills: updatedSkills,
		logEntries,
		result,
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
 * Scales with boss attack power.
 */
export function calculateBossAttackDamage(attackPower: number): number {
	return attackPower;
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
