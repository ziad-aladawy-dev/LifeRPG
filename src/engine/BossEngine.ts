// ============================================================================
// Life RPG — Boss Engine
// Boss and Dungeon lifecycle management.
// ============================================================================

import {
	type Boss,
	type Dungeon,
	type DungeonStage,
	type BossTemplate,
	type EventLogEntry,
	type DungeonTemplate,
	type CharacterAttributes,
	type PluginSettings,
	EventType,
} from "../types";
import { generateId } from "../constants";
import { dealDamageToBoss, calculateGlobalModifiers, calculateBossAttackDamage } from "./GameEngine";

// ---------------------------------------------------------------------------
// Boss Factory
// ---------------------------------------------------------------------------

/**
 * Create a new Boss instance from a template.
 */
export function createBossFromTemplate(template: BossTemplate, attributes: CharacterAttributes): Boss {
	// Base HP scaling: +2% per total attribute point
	const totalAttrLevel = attributes.str.level + attributes.int.level + attributes.wis.level + attributes.cha.level;
	const hpMultiplier = 1 + (totalAttrLevel * 0.02);
	const scaledMaxHp = Math.round(template.baseHp * hpMultiplier);

	return {
		id: generateId(),
		name: template.name,
		icon: template.icon,
		hp: scaledMaxHp,
		maxHp: scaledMaxHp,
		attackPower: template.attackPower,
		xpReward: template.xpReward,
		gpReward: template.gpReward,
		flavor: template.flavor,
		defeated: false,
		startedAt: new Date().toISOString(),
		defeatedAt: null,
		abilities: template.abilities || [],
		lootTable: template.lootTable || [],
		scalingAttribute: template.scalingAttribute,
		scalingFactor: template.scalingFactor || 1.0,
	};
}

// ---------------------------------------------------------------------------
// Boss Combat
// ---------------------------------------------------------------------------

/**
 * Helper to calculate final damage dealt to a boss including all multipliers.
 */
function calculateFinalDamage(
	baseDamage: number,
	boss: Boss,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>,
	comboCount: number = 0
): number {
	let finalDamage = baseDamage;

	// 1. Attribute Bonus: STR applies a 2% bonus to damage per level + gear bonuses
	const strBonus = 1 + ((attributes.str.level + modifiers.str) * 0.02) + modifiers.damageBonus;
	finalDamage = Math.round(finalDamage * strBonus);

	// 2. Combo Bonus: 5% bonus per combo hit (max 50%)
	const comboMultiplier = 1 + Math.min(0.5, (comboCount * 0.05));
	finalDamage = Math.round(finalDamage * comboMultiplier);

	// 3. Boss Rage: Bosses are more vulnerable when enraged
	const hpPct = boss.hp / boss.maxHp;
	let rageMultiplier = 1.0;
	if (hpPct <= 0.25) rageMultiplier = 2.0; // Critical: 2x damage taken
	else if (hpPct <= 0.5) rageMultiplier = 1.5; // Enraged: 1.5x damage taken
	
	finalDamage = Math.round(finalDamage * rageMultiplier);
	return finalDamage;
}

/**
 * Process player dealing damage to the active boss.
 * Returns updated boss, whether defeated, and log entries.
 */
export function playerAttacksBoss(
	boss: Boss,
	damage: number,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>,
	comboCount: number = 0
): {
	boss: Boss;
	defeated: boolean;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	const finalDamage = calculateFinalDamage(damage, boss, attributes, modifiers, comboCount);

	const { newHp, defeated } = dealDamageToBoss(boss.hp, boss.maxHp, finalDamage);

	const updatedBoss: Boss = {
		...boss,
		hp: newHp,
		defeated,
		defeatedAt: defeated ? new Date().toISOString() : null,
	};

	logEntries.push({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.BossDamageDealt,
		message: `⚔️ Dealt ${finalDamage} damage to ${boss.icon} ${boss.name}!${comboCount > 0 ? ` (${comboCount}-Hit Combo!)` : ""} (${newHp}/${boss.maxHp} HP)`,
		xpDelta: 0,
		gpDelta: 0,
		hpDelta: 0,
	});

	if (defeated) {
		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.BossDefeated,
			message: `🏆 ${boss.icon} ${boss.name} DEFEATED! Earned +${boss.xpReward} XP and +${boss.gpReward} GP!`,
			xpDelta: boss.xpReward,
			gpDelta: boss.gpReward,
			hpDelta: 0,
		});
	}

	return { boss: updatedBoss, defeated, logEntries };
}

/**
 * Heal the boss when a task is unchecked.
 * Uses simple STR scaling (no combo/rage multipliers for fairness).
 */
export function healBoss(
	boss: Boss,
	baseAmount: number,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>,
	comboCount: number = 0
): {
	boss: Boss;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	
	// Simple scaling: only apply STR bonus (no combo, no rage)
	// This prevents asymmetric healing mechanics
	const strBonus = 1 + ((attributes.str.level + modifiers.str) * 0.02) + modifiers.damageBonus;
	const healAmount = Math.round(baseAmount * strBonus);
	const newHp = Math.min(boss.maxHp, boss.hp + healAmount);

	const updatedBoss: Boss = {
		...boss,
		hp: newHp,
	};

	logEntries.push({
		id: generateId(),
		timestamp: new Date().toISOString(),
		type: EventType.BossDamageDealt, // Reusing event type
		message: `❤️‍🩹 ${boss.icon} ${boss.name} recovered ${newHp - boss.hp} HP due to unfinished task! (${newHp}/${boss.maxHp} HP)`,
		xpDelta: 0,
		gpDelta: 0,
		hpDelta: 0,
	});

	return { boss: updatedBoss, logEntries };
}

/**
 * Process boss attacking the player (e.g., on missed deadline).
 * Returns damage amount and log entry.
 */
export function bossAttacksPlayer(
	boss: Boss,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>,
	settings: PluginSettings
): { damage: number; logEntry: EventLogEntry } {
	// 1. Level Scaling: +10% base power per character level
	const avgAttrLevel = (attributes.str.level + attributes.int.level + attributes.wis.level + attributes.cha.level) / 4;
	const levelBonus = 1 + (avgAttrLevel * 0.1); 
	
	let rawDamage = Math.round(boss.attackPower * levelBonus);

	// 2. Attribute Resonance (Adversary Mechanic)
	// Add 50% of the player's scaled attribute to boss damage
	if (boss.scalingAttribute) {
		const playerAttr = attributes[boss.scalingAttribute];
		if (playerAttr) {
			const resonance = (playerAttr.level * 0.5) * (boss.scalingFactor || 1.0);
			rawDamage += Math.round(resonance);
		}
	}

	// 3. Time-based Enrage: If the fight has lasted too long, damage increases by 50%
	const enrageHours = settings.bossEnrageHours ?? 48;
	const elapsedMs = Date.now() - new Date(boss.startedAt).getTime();
	const elapsedHours = elapsedMs / (1000 * 60 * 60);
	const isTimeEnraged = elapsedHours >= enrageHours;
	
	if (isTimeEnraged) {
		rawDamage = Math.round(rawDamage * 1.5);
	}

	// 4. HP-based Rage: Bosses deal more damage when at low HP
	const hpPct = boss.hp / boss.maxHp;
	if (hpPct <= 0.25) rawDamage = Math.round(rawDamage * 1.5); // Desperate: 1.5x damage dealt
	else if (hpPct <= 0.5) rawDamage = Math.round(rawDamage * 1.25); // Enraged: 1.25x damage dealt

	// 5. Difficulty Step (Final amplification)
	// Base was already multiplied in calculateBossAttackDamage, but we can add a Madhouse specific boost here
	// if we wanted, but let's stick to the GameEngine logic for now.


	// 3. Apply mitigation (WIS and gear)
	const finalDamage = calculateBossAttackDamage(rawDamage, attributes, modifiers);

	return {
		damage: finalDamage,
		logEntry: {
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.BossAttack,
			message: `💥 ${boss.icon} ${boss.name} attacks you for ${finalDamage} HP damage!${isTimeEnraged ? " (💢 Time-Enraged!)" : ""}`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: -finalDamage,
		},
	};
}

/**
 * Calculate damage for environmental hazards (like missed deadlines).
 * Scales with player level and applies piercing mitigation.
 */
export function calculateOverdueHazardDamage(
	settings: PluginSettings,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): number {
	const base = settings.bossDamageOnMissedDeadline || 15;
	
	// Apply Level-based scaling (+10% per avg attribute level)
	const avgAttrLevel = (attributes.str.level + attributes.int.level + attributes.wis.level + attributes.cha.level) / 4;
	const levelBonus = 1 + (avgAttrLevel * 0.1); 
	
	const scaledRaw = Math.round(base * levelBonus);
	
	// Apply mitigation with piercing (reusing Boss mitigation logic)
	return calculateBossAttackDamage(scaledRaw, attributes, modifiers);
}

// ---------------------------------------------------------------------------
// Dungeon Factory & Management
// ---------------------------------------------------------------------------

/**
 * Create a new Dungeon instance from a template.
 */
export function createDungeonFromTemplate(template: DungeonTemplate, attributes: CharacterAttributes): Dungeon {
	return {
		id: generateId(),
		name: template.name,
		icon: template.icon,
		stages: template.stages.map((s: any) => ({
			name: s.name,
			description: s.description,
			tasksRequired: s.tasksRequired,
			tasksCompleted: 0,
		})),
		currentStage: 0,
		boss: createBossFromTemplate(template.bossTemplate, attributes),
		active: true,
		completedAt: null,
	};
}

/**
 * Get the current stage of a dungeon. Returns null if all stages complete.
 */
export function getCurrentDungeonStage(
	dungeon: Dungeon
): DungeonStage | null {
	if (dungeon.currentStage >= dungeon.stages.length) return null;
	return dungeon.stages[dungeon.currentStage];
}

/**
 * Record a task completion in the active dungeon stage.
 * Returns updated dungeon, whether the stage was completed, and log entries.
 */
export function advanceDungeonProgress(
	dungeon: Dungeon,
	attributes: CharacterAttributes,
	modifiers: ReturnType<typeof calculateGlobalModifiers>
): {
	dungeon: Dungeon;
	stageCompleted: boolean;
	dungeonCleared: boolean;
	damage: number;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	// Deep clone dungeon with its stages to allow mutations
	const updated: Dungeon = {
		...dungeon,
		stages: dungeon.stages.map(s => ({ ...s }))
	};
	let damageDealt = 0;

	if (updated.currentStage >= updated.stages.length) {
		return { dungeon: updated, stageCompleted: false, dungeonCleared: false, damage: 0, logEntries };
	}

	const stage = updated.stages[updated.currentStage];
	stage.tasksCompleted++;

	let stageCompleted = false;
	let dungeonCleared = false;

	if (stage.tasksCompleted >= stage.tasksRequired) {
		stageCompleted = true;
		logEntries.push({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.DungeonStageComplete,
			message: `🏰 Stage "${stage.name}" cleared in ${dungeon.icon} ${dungeon.name}!`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: 0,
		});

		updated.currentStage++;

		// Check if all stages are complete → dungeon cleared
		if (updated.currentStage >= updated.stages.length) {
			dungeonCleared = true;
			updated.active = false;
			updated.completedAt = new Date().toISOString();

			logEntries.push({
				id: generateId(),
				timestamp: new Date().toISOString(),
				type: EventType.DungeonCleared,
				message: `🎊 ${dungeon.icon} ${dungeon.name} CLEARED! Prepare for the dungeon boss!`,
				xpDelta: 0,
				gpDelta: 0,
				hpDelta: 0,
			});
		}
	}
	// --- Dungeon Attrition Damage ---
	// Pushing through a dungeon is taxing. Each task deals small attrition damage.
	// Base: 2 + (StageIndex * 2)
	const baseAttrition = 2 + (updated.currentStage * 2);
	damageDealt = calculateOverdueHazardDamage({ bossDamageOnMissedDeadline: baseAttrition } as any, attributes, modifiers);

	return { 
		dungeon: updated, 
		stageCompleted, 
		dungeonCleared, 
		damage: damageDealt,
		logEntries 
	};
}

/**
 * Revert a task completion in the active dungeon stage.
 */
export function revertDungeonProgress(
	dungeon: Dungeon
): {
	dungeon: Dungeon;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	// Deep clone dungeon with its stages to allow mutations
	const updated: Dungeon = {
		...dungeon,
		stages: dungeon.stages.map(s => ({ ...s }))
	};

	if (updated.currentStage >= updated.stages.length) {
		return { dungeon: updated, logEntries };
	}

	const stage = updated.stages[updated.currentStage];
	if (stage.tasksCompleted > 0) {
		stage.tasksCompleted--;
		// We don't log dungeon un-progression to keep the log clean, 
		// but we could if we wanted.
	}

	return { dungeon: updated, logEntries };
}

/**
 * Get dungeon overall progress as a percentage.
 */
export function getDungeonProgress(dungeon: Dungeon): number {
	const totalTasks = dungeon.stages.reduce(
		(sum, s) => sum + s.tasksRequired,
		0
	);
	const completedTasks = dungeon.stages.reduce(
		(sum, s) => sum + s.tasksCompleted,
		0
	);
	if (totalTasks === 0) return 100;
	return Math.min(100, (completedTasks / totalTasks) * 100);
}
