// ============================================================================
// Life RPG — Utility: Task Metadata Parser
// Parses inline annotations from task markdown lines.
// ============================================================================

import { Difficulty, TaskPriority, type TaskMetadata } from "../types";

/**
 * Parse inline task metadata from a markdown task line.
 *
 * Supports the bracket notation:
 *   - [x] Complete the report [difficulty: hard] [skill: Programming] [deadline: 2026-04-20]
 *
 * All fields are optional and case-insensitive.
 */
export function parseTaskMetadata(lineText: string): TaskMetadata {
	return {
		difficulty: parseDifficulty(lineText),
		skillId: parseSkillId(lineText),
		deadline: parseDeadline(lineText),
		priority: parsePriority(lineText),
	};
}

/**
 * Extract sticky Quest ID from inline text.
 * Matches: [id: a1b2]
 */
export function parseQuestId(lineText: string): string | null {
	const match = lineText.match(/\[id\s*:\s*([a-z0-9]+)\]/i);
	return match ? match[1] : null;
}

/**
 * Extract difficulty from inline text.
 * Matches: [difficulty: easy], [diff: medium], [d: hard]
 * Default: Medium
 */
function parseDifficulty(text: string): Difficulty {
	const match = text.match(/\[(?:difficulty|diff|d)\s*:\s*(easy|med|medium|hard)\]/i);
	if (!match) return Difficulty.Easy;

	const raw = match[1].toLowerCase();
	switch (raw) {
		case "easy":
			return Difficulty.Easy;
		case "med":
		case "medium":
			return Difficulty.Medium;
		case "hard":
			return Difficulty.Hard;
		default:
			return Difficulty.Easy;
	}
}

/**
 * Extract skill ID from inline text.
 * Matches: [skill: Programming], [s: Fitness]
 */
function parseSkillId(text: string): string | null {
	const match = text.match(/\[(?:skill|s)\s*:\s*([^\]]+)\]/i);
	if (!match) return null;
	return match[1].trim();
}

/**
 * Extract deadline from inline text.
 * Matches: [deadline: 2026-04-20], [due: 2026-04-20]
 * Returns ISO date string or null.
 */
function parseDeadline(text: string): string | null {
	const match = text.match(
		/\[(?:deadline|due|dl)\s*:\s*(\d{4}-\d{2}-\d{2})\]/i
	);
	if (!match) return null;

	const date = new Date(match[1]);
	if (isNaN(date.getTime())) return null;
	return date.toISOString();
}

/**
 * Extract Obsidian Tasks priority emoji.
 */
function parsePriority(text: string): TaskPriority {
	if (text.includes("🔺")) return TaskPriority.Highest;
	if (text.includes("⏫")) return TaskPriority.High;
	if (text.includes("🔼")) return TaskPriority.Medium;
	if (text.includes("🔽")) return TaskPriority.Low;
	if (text.includes("⏬")) return TaskPriority.Lowest;
	return TaskPriority.Medium;
}

/**
 * Check if a markdown line is a task (checkbox) line.
 * Matches: "- [ ]", "- [x]", "- [X]", "* [ ]", etc.
 */
export function isTaskLine(line: string): boolean {
	return /^[\s]*[-*]\s\[[ xX]\]/.test(line);
}

/**
 * Check if a task line is completed (checked).
 */
export function isTaskCompleted(line: string): boolean {
	return /^[\s]*[-*]\s\[[xX]\]/.test(line);
}

/**
 * Extract the task text content (without the checkbox and metadata).
 */
export function getTaskText(line: string): string {
	// Remove checkbox prefix
	let text = line.replace(/^[\s]*[-*]\s\[[ xX]\]\s*/, "");
	// Remove inline metadata brackets
	text = text.replace(/\[(?:difficulty|diff|d|skill|s|deadline|due|dl|id)\s*:[^\]]*\]/gi, "");
	// Remove priority emojis 
	text = text.replace(/[🔺⏫🔼🔽⏬⏺️]/g, "");
	// Remove TickTickSync metadata (dataview inline syntax) 
	text = text.replace(/\[ticktick_id::[^\]]+\]/gi, "");
	// Remove Obsidian comments 
	text = text.replace(/%%.*?%%/g, "");
	
	return text.trim();
}
