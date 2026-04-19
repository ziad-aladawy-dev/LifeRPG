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
	EventType,
} from "../types";
import { generateId } from "../constants";
import { dealDamageToBoss, calculateGlobalModifiers } from "./GameEngine";

// ---------------------------------------------------------------------------
// Boss Factory
// ---------------------------------------------------------------------------

/**
 * Create a new Boss instance from a template.
 */
export function createBossFromTemplate(template: BossTemplate): Boss {
	return {
		id: generateId(),
		name: template.name,
		icon: template.icon,
		hp: template.baseHp,
		maxHp: template.baseHp,
		attackPower: template.attackPower,
		xpReward: template.xpReward,
		gpReward: template.gpReward,
		flavor: template.flavor,
		defeated: false,
		startedAt: new Date().toISOString(),
		defeatedAt: null,
		abilities: template.abilities || [],
		lootTable: template.lootTable || [],
	};
}

// ---------------------------------------------------------------------------
// Boss Combat
// ---------------------------------------------------------------------------

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
	let finalDamage = damage;

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
 */
export function healBoss(
	boss: Boss,
	amount: number
): {
	boss: Boss;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	const newHp = Math.min(boss.maxHp, boss.hp + amount);

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
	boss: Boss
): { damage: number; logEntry: EventLogEntry } {
	let damage = boss.attackPower;

	// Boss Rage: Bosses deal more damage when enraged
	const hpPct = boss.hp / boss.maxHp;
	if (hpPct <= 0.25) damage = Math.round(damage * 1.5); // Desperate: 1.5x damage dealt
	else if (hpPct <= 0.5) damage = Math.round(damage * 1.25); // Enraged: 1.25x damage dealt

	return {
		damage,
		logEntry: {
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.BossAttack,
			message: `💥 ${boss.icon} ${boss.name} attacks you for ${damage} HP damage!`,
			xpDelta: 0,
			gpDelta: 0,
			hpDelta: -damage,
		},
	};
}

// ---------------------------------------------------------------------------
// Dungeon Factory & Management
// ---------------------------------------------------------------------------

/**
 * Create a new Dungeon instance from a template.
 */
export function createDungeonFromTemplate(template: DungeonTemplate): Dungeon {
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
		boss: createBossFromTemplate(template.bossTemplate),
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
	dungeon: Dungeon
): {
	dungeon: Dungeon;
	stageCompleted: boolean;
	dungeonCleared: boolean;
	logEntries: EventLogEntry[];
} {
	const logEntries: EventLogEntry[] = [];
	const updated: Dungeon = JSON.parse(JSON.stringify(dungeon));

	if (updated.currentStage >= updated.stages.length) {
		return { dungeon: updated, stageCompleted: false, dungeonCleared: false, logEntries };
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

	return { dungeon: updated, stageCompleted, dungeonCleared, logEntries };
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
	const updated: Dungeon = JSON.parse(JSON.stringify(dungeon));

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
