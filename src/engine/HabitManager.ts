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
	type Item,
	EventType,
} from "../types";
import { generateId, xpThresholdForLevel } from "../constants";
import { getTodayStr, isSameDay, formatDate } from "../utils/dateUtils";
import {
	calculateHabitReward,
	calculateGlobalModifiers,
	processXpGain,
	processHpDamage,
	processGpGain,
	processSkillXpGain,
	processAttributeXpGain,
	revertXpGain,
	revertSkillXpGain,
	revertAttributeXpGain,
	checkStreakContinuity,
	streakBonusMultiplier,
} from "./GameEngine";
import { INITIAL_ITEMS } from "../constants";

/**
 * Robust check if a habit is due today based on recurrence and backlog.
 */
export function isHabitDue(habit: Habit): boolean {
	const today = new Date().toISOString().split("T")[0];
	
	// 1. Backlog is always due
	if ((habit.outstandingDays || 0) > 0) return true;
	
	// 2. Daily is always due
	if ((habit.recurrenceDays || 1) <= 1) return true;
	
	// 3. Completed today (so user can see their success inside the main list)
	if (habit.lastCompleted && habit.lastCompleted.startsWith(today)) return true;
	
	// 4. Calculate if mathematically due today based on start date anchor
	const anchorDateStr = habit.startDate || habit.createdAt.split("T")[0];
	const [ay, am, ad] = anchorDateStr.split("-").map(Number);
	const anchorDate = new Date(ay, am - 1, ad);
	
	const todayParsed = new Date();
	const anchorTime = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate()).getTime();
	const todayTime = new Date(todayParsed.getFullYear(), todayParsed.getMonth(), todayParsed.getDate()).getTime();
	
	const diffDays = Math.round((todayTime - anchorTime) / (1000 * 60 * 60 * 24));
	
	if (diffDays >= 0 && diffDays % (habit.recurrenceDays || 1) === 0) return true;
	
	return false;
}

// ---------------------------------------------------------------------------
// Good Habit Logging
// ---------------------------------------------------------------------------

export function logGoodHabit(
	habit: Habit,
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): {
	habit: Habit;
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	foundItem: any | null;
	spEarned: number;
} {
	const logEntries: EventLogEntry[] = [];
	const today = new Date();
	let updatedHabit = { ...habit };
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));
	let spEarned = 0;

	// Update streak
	if (checkStreakContinuity(updatedHabit.lastCompleted, today)) {
		// Check if already logged today
		if (
			updatedHabit.lastCompleted &&
			new Date(updatedHabit.lastCompleted).toDateString() ===
				today.toDateString()
		) {
			// Already completed today. Return early!
			return { habit: updatedHabit, character: currentChar, skills: updatedSkills, logEntries, foundItem: null, spEarned: 0 };
		}
		
		if ((updatedHabit.outstandingDays || 0) > 0) {
			// Cannot log today's instance until backlogs are resolved
			return { habit: updatedHabit, character: currentChar, skills: updatedSkills, logEntries, foundItem: null, spEarned: 0 };
		}
		
		updatedHabit.streak++;
	} else {
		updatedHabit.streak = 1; // Reset streak
	}
	updatedHabit.lastCompleted = getTodayStr();
	
	// Track in history
	if (!updatedHabit.history) updatedHabit.history = {};
	const todayStr = getTodayStr();
	updatedHabit.history[todayStr] = true;

	// Calculate rewards with streak bonus and gear modifiers
	const baseReward = calculateHabitReward(updatedHabit, settings, currentChar.attributes, modifiers);
	const bonus = streakBonusMultiplier(updatedHabit.streak);
	const xpGain = Math.round(baseReward.xp * bonus);
	const gpGain = Math.round(baseReward.gp * bonus);

	// Update XP/GP values on the habit for display
	updatedHabit.xpReward = xpGain;
	updatedHabit.gpReward = gpGain;

	// Award GP
	currentChar = processGpGain(currentChar, gpGain);

	// Process character XP
	const wisBonus = settings.wisBonus || 10;
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
			spEarned += skillResult.spEarned;

			// Level the corresponding attribute
			const skillRef = updatedSkills[skillIdx];
			if (skillRef.attribute) {
				const attrObj = currentChar.attributes[skillRef.attribute];
				if (attrObj) {
					const ratio = settings.skillToAttributeRatio ?? 0.2;
					const attrXp = Math.round(xpGain * ratio);
					const attrResult = processAttributeXpGain(skillRef.attribute, attrObj, attrXp);
					currentChar.attributes[skillRef.attribute] = attrResult.attribute;
					logEntries.push(...attrResult.logEntries);
				}
			}
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

	// Chance to find an item (5% base + CHA bonus + dropChance modifier)
	let foundItem = null;
	const chaBonus = (currentChar.attributes.cha.level + modifiers.cha) * 0.01;
	const totalDropChance = 0.05 + chaBonus + modifiers.dropChance;
	if (Math.random() < totalDropChance) {
		const randomIndex = Math.floor(Math.random() * INITIAL_ITEMS.length);
		foundItem = { ...INITIAL_ITEMS[randomIndex], id: generateId() };
		
		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.ItemFound,
			message: `🎁 You found a rare item: **${foundItem.name}**!`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});
	}

	return {
		habit: updatedHabit,
		character: currentChar,
		skills: updatedSkills,
		logEntries,
		foundItem,
		spEarned
	};
}

// ---------------------------------------------------------------------------
// Bad Habit Logging
// ---------------------------------------------------------------------------

export function logBadHabit(
	habit: Habit,
	character: CharacterState,
	settings: PluginSettings,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): {
	habit: Habit;
	character: CharacterState;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	const updatedHabit = { ...habit };
	let currentChar = { ...character };

	const todayStr = getTodayStr();
	
	// Check if already logged today
	if (
		updatedHabit.lastCompleted &&
		isSameDay(updatedHabit.lastCompleted, todayStr)
	) {
		return { habit: updatedHabit, character: currentChar, logEntries };
	}

	if ((updatedHabit.outstandingDays || 0) > 0) {
		return { habit: updatedHabit, character: currentChar, logEntries };
	}

	// Calculate damage
	const reward = calculateHabitReward(updatedHabit, settings, currentChar.attributes, modifiers);
	const damage = reward.hpDamage;

	// Update habit tracking
	updatedHabit.lastCompleted = getTodayStr();
	updatedHabit.streak++; // For bad habits, streak = how many times in a row
	updatedHabit.hpPenalty = damage;

	// Track in history
	if (!updatedHabit.history) updatedHabit.history = {};
	updatedHabit.history[todayStr] = true;

	// Apply damage
	const wisBonus = settings.wisBonus || 10;
	const actualHpGain = settings.hpPerLevel + (currentChar.attributes.wis.level * wisBonus);
	const wasLevelGreaterThanOne = currentChar.level > 1;
	const hpResult = processHpDamage(currentChar, damage, actualHpGain, modifiers);
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

export function evaluateDailyHabits(
	habits: Habit[],
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): {
	updatedHabits: Habit[];
	logEntries: EventLogEntry[];
	character: CharacterState;
	skills: Skill[];
	spEarned: number;
} {
	const todayStr = getTodayStr();
	const logEntries: EventLogEntry[] = [];
	let currentChar = { ...character };
	let updatedSkills = skills.map((s) => ({ ...s }));
	let spEarned = 0;

	const resultHabits = habits.map((habit) => {
		const h = { ...habit };
		
		// 1. Determine anchor for start
		const anchorDateStr = h.startDate || h.createdAt.split("T")[0];
		const [ay, am, ad] = anchorDateStr.split("-").map(Number);
		const anchorDate = new Date(ay, am - 1, ad);
		
		const recurrence = h.recurrenceDays || 1;
		const today = new Date();
		
		// 2. Automated "Missed" logic for gaps older than 15 days
		if (!h.history) h.history = {};
		
		const maxLookback = 60; // Sanity cap
		for (let i = 16; i <= maxLookback; i++) {
			const checkDate = new Date(today);
			checkDate.setDate(today.getDate() - i);
			
			// Don't look back before ritual started
			if (checkDate.getTime() < anchorDate.getTime()) break;
			
			const dateStr = formatDate(checkDate);
			
			// Check if it was a due day
			const diffMs = checkDate.getTime() - anchorDate.getTime();
			const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
			
			if (diffDays % recurrence === 0) {
				// If unresolved gap, mark as missed (false) to clear from future scans
				if (h.history[dateStr] === undefined) {
					h.history[dateStr] = false;
				}
			}
		}

		// 3. Recalculate dynamic status
		// Bad habits should NEVER accumulate outstanding days — the goal is to NOT do them.
		if (h.type === "good") {
			h.outstandingDays = calculateOutstandingDates(h).length;
		} else {
			h.outstandingDays = 0;
		}
		h.lastEvaluatedDate = todayStr;
		h.streak = recalculateHabitStreak(h);

		return h;
	});

	return { 
		updatedHabits: resultHabits, 
		character: currentChar, 
		skills: updatedSkills, 
		logEntries, 
		spEarned 
	};
}

/**
 * Finds specific dates that were due but have no entry in history.
 * Limited to a 15-day lookback per user request.
 */
export function calculateOutstandingDates(habit: Habit): string[] {
	const recurrence = habit.recurrenceDays || 1;
	const history = habit.history || {};
	const today = new Date();
	const todayStr = getTodayStr();
	
	// Anchor calculation from the start date or creation date
	const anchorDateStr = habit.startDate || habit.createdAt.split("T")[0];
	const [ay, am, ad] = anchorDateStr.split("-").map(Number);
	const anchorDate = new Date(ay, am - 1, ad);
	
	const outstanding: string[] = [];
	
	// We look back at most 15 days from yesterday
	const lookbackLimit = 15;
	for (let i = 1; i <= lookbackLimit; i++) {
		const checkDate = new Date(today);
		checkDate.setDate(today.getDate() - i);
		
		// Don't look back before the habit even started
		if (checkDate.getTime() < anchorDate.getTime()) break;
		
		const dateStr = formatDate(checkDate);
		
		// 1. Is this date a 'due' date according to the recurrence?
		// Calculate days between anchor and checkDate
		const diffMs = checkDate.getTime() - anchorDate.getTime();
		const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
		
		if (diffDays % recurrence === 0) {
			// 2. Is it unresolved (not in history)?
			if (history[dateStr] === undefined) {
				outstanding.push(dateStr);
			}
		}
	}
	
	return outstanding.sort(); // Oldest first
}

/**
 * Resolves a single outstanding habit instance.
 * Now targets the oldest specific date identified by the gap calculation.
 */
export function resolveOutstandingHabit(
	habit: Habit,
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings,
	wasCompleted: boolean,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): {
	habit: Habit;
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	spEarned: number;
} {
	const logEntries: EventLogEntry[] = [];
	const h = { ...habit };
	let c = { ...character };
	const s = skills.map(sk => ({ ...sk }));
	let spEarned = 0;

	// Find the oldest gap to resolve
	const gaps = calculateOutstandingDates(h);
	if (gaps.length === 0) {
		return { habit: h, character: c, skills: s, logEntries, spEarned: 0 };
	}
	
	const targetDateStr = gaps[0];

	if (wasCompleted) {
		// Award rewards
		const reward = calculateHabitReward(h, settings, c.attributes, modifiers);
		const xpGain = reward.xp;
		const gpGain = reward.gp;

		c = processGpGain(c, gpGain);
		const wisBonus = settings.wisBonus || 10;
		const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
		const xpRes = processXpGain(c, xpGain, actualHpGain);
		c = xpRes.character;
		logEntries.push(...xpRes.logEntries);

		if (h.skillId) {
			const skillIdx = s.findIndex(sk => sk.id === h.skillId || sk.name.toLowerCase() === h.skillId?.toLowerCase());
			if (skillIdx !== -1) {
				const skResult = processSkillXpGain(s[skillIdx], xpGain);
				s[skillIdx] = skResult.skill;
				logEntries.push(...skResult.logEntries);
				spEarned += skResult.spEarned;

				const skillRef = s[skillIdx];
				if (skillRef.attribute) {
					const attrObj = c.attributes[skillRef.attribute];
					if (attrObj) {
						const ratio = settings.skillToAttributeRatio ?? 0.2;
						const attrXp = Math.round(xpGain * ratio);
						const attrRes = processAttributeXpGain(skillRef.attribute, attrObj, attrXp);
						c.attributes[skillRef.attribute] = attrRes.attribute;
						logEntries.push(...attrRes.logEntries);
					}
				}
			}
		}

		logEntries.unshift({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HabitGood,
			message: `⏪ Resolved Backlog (${targetDateStr}): "${h.name}" marked Done → +${xpGain} XP, +${gpGain} GP`,
			xpDelta: xpGain,
			gpDelta: gpGain,
			hpDelta: 0,
		});
		
		if (!h.history) h.history = {};
		h.history[targetDateStr] = true;
	} else {
		// Mark as missed (False)
		const reward = calculateHabitReward(h, settings, c.attributes, modifiers);
		const wisBonus = settings.wisBonus || 10;
		const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
		const hpResult = processHpDamage(c, reward.hpDamage, actualHpGain, modifiers);
		c = hpResult.character;
		if (hpResult.died) logEntries.push(...hpResult.logEntries);

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HabitBad,
			message: `💔 Resolved Backlog (${targetDateStr}): "${h.name}" marked Missed → -${reward.hpDamage} HP. Streak Reset.`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: -reward.hpDamage,
		});
		
		if (!h.history) h.history = {};
		h.history[targetDateStr] = false;
	}

	// Recalculate status
	h.outstandingDays = calculateOutstandingDates(h).length;
	h.streak = recalculateHabitStreak(h);

	return { habit: h, character: c, skills: s, logEntries, spEarned };
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
	spEarned: number;
} {
	const logEntries: EventLogEntry[] = [];
	let h = { ...habit };
	let c = { ...character };
	let s = skills.map((sk) => ({ ...sk }));
	let spEarned = 0;

	const today = getTodayStr();
	if (!h.lastCompleted || !isSameDay(h.lastCompleted, today)) {
		return { habit: h, character: c, skills: s, logEntries, spEarned };
	}

	if (h.type === "good") {
		// Reverse XP and GP
		const xpToRevert = h.xpReward || 0;
		const gpToRevert = h.gpReward || 0;

		// Revert GP
		c.gp = Math.max(0, c.gp - gpToRevert);

		// Revert XP
		const wisBonus = settings.wisBonus || 10;
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
				if (skillResult.leveledDown) spEarned -= 1;

				// Revert Attribute XP
				const skillRef = s[skillIdx];
				if (skillRef.attribute) {
					const attrObj = c.attributes[skillRef.attribute];
					if (attrObj) {
						const ratio = settings.skillToAttributeRatio ?? 0.2;
						const attrXp = Math.round(xpToRevert * ratio);
						const attrResult = revertAttributeXpGain(skillRef.attribute, attrObj, attrXp);
						c.attributes[skillRef.attribute] = attrResult.attribute;
						logEntries.push(...attrResult.logEntries);
					}
				}
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
			const wisBonus = settings.wisBonus || 10;
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
	if (h.history) {
		const todayStr = getTodayStr();
		delete h.history[todayStr];
	}

	return { habit: h, character: c, skills: s, logEntries, spEarned };
}

/**
 * Apply a retroactive change to a habit's history.
 * This function calculates the XP/GP/HP deltas and returns the updated state.
 */
export function applyRetroactiveHabitHistoryChange(
	habit: Habit,
	dateStr: string,
	completed: boolean,
	character: CharacterState,
	skills: Skill[],
	settings: PluginSettings,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): {
	habit: Habit;
	character: CharacterState;
	skills: Skill[];
	logEntries: EventLogEntry[];
	spEarned: number;
} {
	const logEntries: EventLogEntry[] = [];
	let h = { ...habit };
	let c = { ...character };
	let s = skills.map((sk) => ({ ...sk }));
	let spEarned = 0;

	if (!h.history) h.history = {};
	const wasCompleted = !!h.history[dateStr];
	
	if (wasCompleted === completed) {
		return { habit: h, character: c, skills: s, logEntries, spEarned };
	}
	
	// Calculate rewards/penalties for this habit
	const reward = calculateHabitReward(h, settings, c.attributes, modifiers);
	
	if (h.type === "good") {
		const xpDelta = completed ? reward.xp : -reward.xp;
		const gpDelta = completed ? reward.gp : -reward.gp;

		if (completed) {
			// NONE -> COMPLETED
			c = processGpGain(c, gpDelta);
			const wisBonus = 10;
			const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
			const xpResult = processXpGain(c, xpDelta, actualHpGain);
			c = xpResult.character;
			logEntries.push(...xpResult.logEntries);

			if (h.skillId) {
				const sIdx = s.findIndex(sk => sk.id === h.skillId || sk.name.toLowerCase() === h.skillId!.toLowerCase());
				if (sIdx !== -1) {
					const skRes = processSkillXpGain(s[sIdx], xpDelta);
					s[sIdx] = skRes.skill;
					logEntries.push(...skRes.logEntries);
					spEarned += skRes.spEarned;

					// Level attribute
					const skillRef = s[sIdx];
					if (skillRef.attribute) {
						const attrObj = c.attributes[skillRef.attribute];
						if (attrObj) {
							const ratio = settings.skillToAttributeRatio ?? 0.2;
							const attrXp = Math.round(xpDelta * ratio);
							const attrRes = processAttributeXpGain(skillRef.attribute, attrObj, attrXp);
							c.attributes[skillRef.attribute] = attrRes.attribute;
							logEntries.push(...attrRes.logEntries);
						}
					}
				}
			}
		} else {
			// COMPLETED -> NONE
			c.gp = Math.max(0, c.gp + gpDelta);
			const wisBonus = 10;
			const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
			const xpResult = revertXpGain(c, Math.abs(xpDelta), actualHpGain);
			c = xpResult.character;
			logEntries.push(...xpResult.logEntries);

			if (h.skillId) {
				const sIdx = s.findIndex(sk => sk.id === h.skillId || sk.name.toLowerCase() === h.skillId!.toLowerCase());
				if (sIdx !== -1) {
					const skRes = revertSkillXpGain(s[sIdx], Math.abs(xpDelta));
					s[sIdx] = skRes.skill;
					logEntries.push(...skRes.logEntries);
					if (skRes.leveledDown) spEarned -= 1;

					// Revert attribute
					const skillRef = s[sIdx];
					if (skillRef.attribute) {
						const attrObj = c.attributes[skillRef.attribute];
						if (attrObj) {
							const ratio = settings.skillToAttributeRatio ?? 0.2;
							const attrXp = Math.round(Math.abs(xpDelta) * ratio);
							const attrRes = revertAttributeXpGain(skillRef.attribute, attrObj, attrXp);
							c.attributes[skillRef.attribute] = attrRes.attribute;
							logEntries.push(...attrRes.logEntries);
						}
					}
				}
			}
		}

		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.HabitGood,
			message: `⏪ History Adjusted (${dateStr}): "${h.name}" marked as ${completed ? 'Completed' : 'Missed'} → ${xpDelta > 0 ? '+' : ''}${xpDelta} XP, ${gpDelta > 0 ? '+' : ''}${gpDelta} GP`,
			xpDelta,
			gpDelta,
			hpDelta: 0,
		});
	} else {
		// Bad Habit
		const hpDelta = completed ? -reward.hpDamage : reward.hpDamage;
		const oldHp = c.hp;

	if (completed) {
		// NONE -> COMPLETED (Took damage)
		const wisBonus = settings.wisBonus || 10;
		const actualHpGain = settings.hpPerLevel + (c.attributes.wis.level * wisBonus);
		const hpResult = processHpDamage(c, reward.hpDamage, actualHpGain, modifiers);
		c = hpResult.character;
		if (hpResult.died) logEntries.push(...hpResult.logEntries);
	} else {
		// COMPLETED -> NONE (Heal damage)
		c.hp = Math.min(c.maxHp, c.hp + reward.hpDamage);
	}

	const oldHpForLog = c.hp - (completed ? -reward.hpDamage : reward.hpDamage);

	logEntries.push({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.HabitBad,
		message: `⏪ History Adjusted (${dateStr}): "${h.name}" marked as ${completed ? 'Completed' : 'Cleared'} → ${c.hp - oldHp > 0 ? '+' : ''}${c.hp - oldHp} HP`,
		xpDelta: 0,
		gpDelta: 0,
		hpDelta: c.hp - oldHp,
	});
}

	// Update history map
	if (completed) {
		h.history[dateStr] = true;
	} else {
		delete h.history[dateStr];
		// If un-marking Today, clear lastCompleted to fix ghost streak
		if (isSameDay(dateStr, getTodayStr())) {
			h.lastCompleted = null;
		}
	}

	// Recalculate streak and backlog
	h.streak = recalculateHabitStreak(h);
	h.outstandingDays = calculateOutstandingDates(h).length;

	return { habit: h, character: c, skills: s, logEntries, spEarned };
}

/**
 * Robustly recalculates habit streaks from history.
 */
export function recalculateHabitStreak(habit: Habit): number {
	const recurrence = habit.recurrenceDays || 1;
	const history = habit.history || {};
	
	// Determine the hard floor for calculations (User Start Date or Creation Date)
	const anchorDateStr = habit.startDate || habit.createdAt.split("T")[0];
	const [ay, am, ad] = anchorDateStr.split("-").map(Number);
	const anchorTime = new Date(ay, am - 1, ad).getTime();
	
	// History is the absolute source of truth
	let historyKeys = Object.keys(history).filter(k => history[k] === true || history[k] === "freeze");
	historyKeys = [...new Set(historyKeys)].sort().reverse();
	
	const parseLocalDate = (s: string) => {
		const [y, m, d] = s.split("-").map(Number);
		return new Date(y, m - 1, d);
	};

	const todayStr = getTodayStr();

	if (habit.type === "good") {
		if (historyKeys.length === 0) return 0;

		const todayTime = parseLocalDate(todayStr).getTime();
		
		// 1. Find the most recent completion
		const mostRecentStr = historyKeys[0];
		const mostRecentTime = parseLocalDate(mostRecentStr).getTime();
		
		// 2. Check if the gap from today to most recent is valid
		const diffDays = Math.floor((todayTime - mostRecentTime) / (1000 * 60 * 60 * 24));
		const backlogDays = (habit.outstandingDays || 0) * recurrence;
		const maxAllowedGap = recurrence + backlogDays;

		if (diffDays > maxAllowedGap) {
			return 0; // Streak broken because it's been too long since last logged
		}

		// 3. Count backwards through actual completions
		// Start at 1 because we have at least one valid completion that hasn't decayed
		let streak = 1;
		
		// Optimization: Pre-parse all dates once to avoid repeated parsing in the loop
		let prevTime = mostRecentTime;
		
		for (let i = 1; i < historyKeys.length; i++) {
			const currTime = parseLocalDate(historyKeys[i]).getTime();
			const gap = Math.floor((prevTime - currTime) / (1000 * 60 * 60 * 24));
			
			// As long as the gap between consecutive completions is <= recurrence,
			// the chain is unbroken. (Allowing early completions)
			if (gap <= recurrence) {
				streak++;
				prevTime = currTime;
			} else {
				// The gap was too large, chain was broken in the past
				break;
			}
		}
		
		return streak;
	} else {
		// Bad Habits: Streak = Days Resisted (consecutive days NOT in history)
		
		// User Relapsed Today? Immediate reset to 0.
		if (history[todayStr]) {
			return 0;
		}

		let streak = 0;
		let checkDate = parseLocalDate(todayStr);
		
		// Loop back day by day starting from today until we hit the start date
		while (true) {
			// HARD STOP: Don't count before the ritual start date!
			// We use a small buffer (12 hours = 43200000ms) to avoid timezone/daylight saving time boundary issues.
			if (checkDate.getTime() < anchorTime - 43200000) {
				break;
			}

			const dateStr = formatDate(checkDate);
			if (!history[dateStr]) {
				streak++;
				checkDate.setDate(checkDate.getDate() - 1);
			} else {
				// Hit a day where the bad habit was done (logged), which breaks the resisted streak.
				break;
			}
		}
		
		return streak;
	}
}
