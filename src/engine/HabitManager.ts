// ============================================================================
// Life RPG — Habit Manager
// Habit tracking, streak management, and daily status checks.
// ============================================================================

import {
	type Habit,
	type CharacterState,
	type Skill,
	type EventLogEntry,
	type PluginSettings,
	EventType,
} from "../types";
import { generateId, xpThresholdForLevel } from "../constants";
import { getTodayStr, isSameDay } from "../utils/dateUtils";
import {
	calculateHabitReward,
	processXpGain,
	processHpDamage,
	processGpGain,
	processSkillXpGain,
	revertXpGain,
	revertSkillXpGain,
	checkStreakContinuity,
	streakBonusMultiplier,
} from "./GameEngine";

// ---------------------------------------------------------------------------
// Good Habit Logging
// ---------------------------------------------------------------------------

/**
 * Log a good habit completion. Awards XP, GP, updates streak, and processes
 * skill XP if the habit is linked to a skill.
 */
export function logGoodHabit(
	habit: Habit,
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings
): {
	habit: Habit;
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	const today = new Date();
	let updatedHabit = { ...habit };
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));

	// Update streak
	if (checkStreakContinuity(updatedHabit.lastCompleted, today)) {
		// Check if already logged today
		if (
			updatedHabit.lastCompleted &&
			new Date(updatedHabit.lastCompleted).toDateString() ===
				today.toDateString()
		) {
			// Already completed today. Return early!
			return { habit: updatedHabit, character: currentChar, skills: updatedSkills, logEntries };
		}
		
		if ((updatedHabit.outstandingDays || 0) > 0) {
			// Cannot log today's instance until backlogs are resolved
			return { habit: updatedHabit, character: currentChar, skills: updatedSkills, logEntries };
		}
		
		updatedHabit.streak++;
	} else {
		updatedHabit.streak = 1; // Reset streak
	}
	updatedHabit.lastCompleted = today.toISOString();

	// Calculate rewards with streak bonus
	const baseReward = calculateHabitReward("good", habit.difficulty, settings);
	const bonus = streakBonusMultiplier(updatedHabit.streak);
	const xpGain = Math.round(baseReward.xp * bonus);
	const gpGain = Math.round(baseReward.gp * bonus);

	// Update XP/GP values on the habit for display
	updatedHabit.xpReward = xpGain;
	updatedHabit.gpReward = gpGain;

	// Award GP
	currentChar = processGpGain(currentChar, gpGain);

	// Process character XP
	const wisBonus = 10;
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * wisBonus);
	const xpResult = processXpGain(currentChar, xpGain, actualHpGain);
	currentChar = xpResult.character;
	logEntries.push(...xpResult.logEntries);

	// Process skill XP if linked
	if (habit.skillId) {
		const skillIdx = updatedSkills.findIndex(
			(s) =>
				s.id === habit.skillId ||
				s.name.toLowerCase() === habit.skillId!.toLowerCase()
		);
		if (skillIdx !== -1) {
			const skillResult = processSkillXpGain(
				updatedSkills[skillIdx],
				xpGain
			);
			updatedSkills[skillIdx] = skillResult.skill;
			logEntries.push(...skillResult.logEntries);
		}
	}

	// Create log entry
	const streakText =
		updatedHabit.streak > 1 ? ` (🔥 ${updatedHabit.streak} streak!)` : "";
	logEntries.unshift({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.HabitGood,
		message: `✨ Good habit: "${habit.name}" → +${xpGain} XP, +${gpGain} GP${streakText}`,
		xpDelta: xpGain,
		gpDelta: gpGain,
		hpDelta: 0,
	});

	return {
		habit: updatedHabit,
		character: currentChar,
		skills: updatedSkills,
		logEntries,
	};
}

// ---------------------------------------------------------------------------
// Bad Habit Logging
// ---------------------------------------------------------------------------

/**
 * Log a bad habit occurrence. Deals HP damage to the character.
 */
export function logBadHabit(
	habit: Habit,
	character: CharacterState,
	settings: PluginSettings
): {
	habit: Habit;
	character: CharacterState;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	const updatedHabit = { ...habit };
	let currentChar = { ...character };

	const todayStr = new Date().toISOString().split("T")[0];
	
	// Check if already logged today
	if (
		updatedHabit.lastCompleted &&
		new Date(updatedHabit.lastCompleted).toISOString().split("T")[0] === todayStr
	) {
		return { habit: updatedHabit, character: currentChar, logEntries };
	}

	if ((updatedHabit.outstandingDays || 0) > 0) {
		return { habit: updatedHabit, character: currentChar, logEntries };
	}

	// Calculate damage
	const reward = calculateHabitReward("bad", habit.difficulty, settings);
	const damage = reward.hpDamage;

	// Update habit tracking
	updatedHabit.lastCompleted = new Date().toISOString();
	updatedHabit.streak++; // For bad habits, streak = how many times in a row
	updatedHabit.hpPenalty = damage;

	// Apply damage
	const wisBonus = 10;
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * wisBonus);
	const wasLevelGreaterThanOne = currentChar.level > 1;
	const hpResult = processHpDamage(currentChar, damage, actualHpGain);
	if (hpResult.died && wasLevelGreaterThanOne) {
		updatedHabit.causedDeathLevelDown = true;
	} else {
		updatedHabit.causedDeathLevelDown = false;
	}
	currentChar = hpResult.character;
	logEntries.push(...hpResult.logEntries);

	// Create log entry
	logEntries.push({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.HabitBad,
		message: `💔 Bad habit: "${habit.name}" → -${damage} HP (${currentChar.hp}/${currentChar.maxHp})`,
		xpDelta: 0,
		gpDelta: 0,
		hpDelta: -damage,
	});

	return {
		habit: updatedHabit,
		character: currentChar,
		logEntries,
	};
}

// ---------------------------------------------------------------------------
// Daily Evaluation & Resolution
// ---------------------------------------------------------------------------

/**
 * Checks all habits and computes missed days since the last evaluation.
 * Caps the missed days at 7 to prevent completely breaking the game.
 */
export function evaluateDailyHabits(habits: Habit[]): Habit[] {
	const todayStr = getTodayStr();
	const todayDate = new Date(todayStr);

	return habits.map((habit) => {
		const h = { ...habit };
		
		if (!h.lastEvaluatedDate) {
			h.lastEvaluatedDate = todayStr;
			h.outstandingDays = 0;
			return h;
		}

		if (h.lastEvaluatedDate === todayStr) {
			return h;
		}

		const evalDate = new Date(h.lastEvaluatedDate);
		const diffTime = todayDate.getTime() - evalDate.getTime();
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays > 0) {
			if (h.type === "good") {
				// We need a robust way to track days elapsed since the *last* valid completion
				// relative to the recurrence interval.
				const recurrence = h.recurrenceDays || 1;
				
				// To handle daily checks properly without losing remainder days:
				// If we evaluate daily, `diffDays` is 1. If recurrence is 3, Math.floor(1/3) = 0.
				// Next day, diffDays=1, still 0. We'd never accumulate debt!
				// So instead, we must NOT update `lastEvaluatedDate` if we haven't crossed the recurrence threshold.

				// Let's track the *total* days elapsed since the last evaluated date.
				// If total >= recurrence, we process the chunk and push lastEvaluatedDate forward.
				let missedChunks = Math.floor(diffDays / recurrence);

				if (missedChunks > 0) {
					// Did they complete it on the actual lastEvaluatedDate?
					// Wait, if lastEvaluatedDate moves in chunks of `recurrence`, this is cleaner.
					const lastCompStr = h.lastCompleted ? new Date(h.lastCompleted).toISOString().split("T")[0] : null;
					if (lastCompStr === h.lastEvaluatedDate) {
						missedChunks -= 1; // Safed the first chunk
					}

					h.outstandingDays = Math.min(7, (h.outstandingDays || 0) + missedChunks);

					// Advance the evaluated date by exactly the chunks we processed,
					// keeping any remainder days for tomorrow's check.
					const newEvalDate = new Date(evalDate.getTime() + (missedChunks * recurrence * 24 * 60 * 60 * 1000));
					h.lastEvaluatedDate = newEvalDate.toISOString().split("T")[0];
				}
			} else {
				h.lastEvaluatedDate = todayStr;
			}
		}

		return h;
	});
}

/**
 * Resolve an outstanding habit missed on a previous day.
 */
export function resolveOutstandingHabit(
	habit: Habit,
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings,
	wasCompleted: boolean
): {
	habit: Habit;
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	let h = { ...habit };
	let c = { ...character };
	let s = skills.map((sk) => ({ ...sk }));

	if (wasCompleted) {
		// They did it, just forgot to check it. Award XP/GP based on current streak.
		const baseReward = calculateHabitReward("good", h.difficulty, settings);
		const bonus = streakBonusMultiplier(h.streak);
		const xpGain = Math.round(baseReward.xp * bonus);
		const gpGain = Math.round(baseReward.gp * bonus);

		c = processGpGain(c, gpGain);
		const wisBonus = 10;
		const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
		const xpResult = processXpGain(c, xpGain, actualHpGain);
		c = xpResult.character;
		logEntries.push(...xpResult.logEntries);

		if (h.skillId) {
			const skillIdx = s.findIndex(sk => sk.id === h.skillId || sk.name.toLowerCase() === h.skillId!.toLowerCase());
			if (skillIdx !== -1) {
				const skResult = processSkillXpGain(s[skillIdx], xpGain);
				s[skillIdx] = skResult.skill;
				logEntries.push(...skResult.logEntries);
			}
		}

		logEntries.unshift({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HabitGood,
			message: `⏪ Retroactive Good Habit: "${h.name}" → +${xpGain} XP, +${gpGain} GP`,
			xpDelta: xpGain,
			gpDelta: gpGain,
			hpDelta: 0,
		});
		
		h.streak++; // Retain and increment streak
	} else {
		// They failed it. Take damage, break streak entirely.
		const reward = calculateHabitReward("bad", h.difficulty, settings);
		
		// Apply damage
		const wisBonus = 10;
		const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
		const hpResult = processHpDamage(c, reward.hpDamage, actualHpGain);
		c = hpResult.character;
		if (hpResult.died) logEntries.push(...hpResult.logEntries);

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HabitBad,
			message: `💔 Missed Habit: "${h.name}" → -${reward.hpDamage} HP. Streak broken!`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: -reward.hpDamage,
		});
		
		h.streak = 0; // Streak totally wiped out
	}

	h.outstandingDays = Math.max(0, h.outstandingDays - 1);

	return { habit: h, character: c, skills: s, logEntries };
}

/**
 * Undo a habit action that was completed TODAY.
 * Reverses XP, GP, and HP changes and restores the streak.
 */
export function undoHabit(
	habit: Habit,
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings
): {
	habit: Habit;
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	let h = { ...habit };
	let c = { ...character };
	let s = skills.map((sk) => ({ ...sk }));

	const today = getTodayStr();
	if (!h.lastCompleted || !isSameDay(h.lastCompleted, today)) {
		return { habit: h, character: c, skills: s, logEntries };
	}

	if (h.type === "good") {
		// Reverse XP and GP
		const xpToRevert = h.xpReward || 0;
		const gpToRevert = h.gpReward || 0;

		// Revert GP
		c.gp = Math.max(0, c.gp - gpToRevert);

		// Revert XP
		const wisBonus = 10;
		const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
		const xpResult = revertXpGain(c, xpToRevert, actualHpGain);
		c = xpResult.character;
		logEntries.push(...xpResult.logEntries);

		// Revert Skill XP
		if (h.skillId) {
			const skillIdx = s.findIndex(
				(sk) =>
					sk.id === h.skillId ||
					sk.name.toLowerCase() === h.skillId!.toLowerCase()
			);
			if (skillIdx !== -1) {
				const skillResult = revertSkillXpGain(s[skillIdx], xpToRevert);
				s[skillIdx] = skillResult.skill;
				logEntries.push(...skillResult.logEntries);
			}
		}

		// Decrement streak
		h.streak = Math.max(0, h.streak - 1);
		
		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HabitGood,
			message: `↩️ Undid good habit: "${h.name}". Streak reduced to ${h.streak}.`,
			xpDelta: -xpToRevert,
			gpDelta: -gpToRevert,
			hpDelta: 0,
		});
	} else {
		// Reverse Bad Habit (Heal the damage)
		const hpToRestore = h.hpPenalty || 0;
		const oldHp = c.hp;

		if (h.causedDeathLevelDown) {
			c.level++;
			const wisBonus = 10;
			const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
			c.maxHp += actualHpGain;
			c.xpToNextLevel = xpThresholdForLevel(c.level);
		}
		c.hp = Math.min(c.maxHp, c.hp + hpToRestore);
		
		// Bad habit streaks for us were just counters, so we reduce it
		h.streak = Math.max(0, h.streak - 1);

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HpRegen,
			message: `↩️ Undid bad habit: "${h.name}". Healed ${c.hp - oldHp} HP.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: c.hp - oldHp,
		});
	}

	// Reset lastCompleted
	h.lastCompleted = null;

	return { habit: h, character: c, skills: s, logEntries };
}
