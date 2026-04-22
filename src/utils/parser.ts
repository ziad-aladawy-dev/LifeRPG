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
	const energy = parseEnergyScores(lineText);
	return {
		difficulty: parseDifficulty(lineText),
		skillId: parseSkillId(lineText),
		deadline: parseDeadline(lineText),
		priority: parsePriority(lineText),
		isHeading: parseIsHeading(lineText),
		...energy
	};
}

/**
 * Extract energy scores from bracketed metadata.
 * Supports: [m: 5], [p: 2], [w: 1] OR [m: 5, p: 2, w: 1]
 */
function parseEnergyScores(text: string): { energyM?: number, energyP?: number, energyW?: number } {
	const result: { energyM?: number, energyP?: number, energyW?: number } = {};
	
	// Individual matches
	const mMatch = text.match(/\[(?:mental|m)\s*:\s*(\d)\]/i);
	if (mMatch) result.energyM = Math.min(5, Math.max(0, parseInt(mMatch[1])));
	
	const pMatch = text.match(/\[(?:physical|p)\s*:\s*(\d)\]/i);
	if (pMatch) result.energyP = Math.min(5, Math.max(0, parseInt(pMatch[1])));
	
	const wMatch = text.match(/\[(?:willpower|w)\s*:\s*(\d)\]/i);
	if (wMatch) result.energyW = Math.min(5, Math.max(0, parseInt(wMatch[1])));
	
	// Composite match: [m: 5, p: 2, w: 1]
	const compositeMatch = text.match(/\[(m|p|w|mental|physical|willpower)[^\]]+\]/gi);
	if (compositeMatch) {
		for (const m of compositeMatch) {
			const content = m.slice(1, -1); // remove [ and ]
			const parts = content.split(",");
			for (const p of parts) {
				const kv = p.split(":");
				if (kv.length === 2) {
					const key = kv[0].trim().toLowerCase();
					const val = parseInt(kv[1].trim());
					if (!isNaN(val)) {
						if (key === "m" || key === "mental") result.energyM = Math.min(5, Math.max(0, val));
						if (key === "p" || key === "physical") result.energyP = Math.min(5, Math.max(0, val));
						if (key === "w" || key === "willpower") result.energyW = Math.min(5, Math.max(0, val));
					}
				}
			}
		}
	}
	
	return result;
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
 * Detect if a task is a heading [type: heading] or [heading: true]
 */
function parseIsHeading(text: string): boolean {
	return /\[(?:type|heading)\s*:\s*(heading|true)\]/i.test(text);
}

/**
 * Extract difficulty from inline text.
 * Matches: [difficulty: easy], [diff: medium], [d: hard]
 * Default: Medium
 */
function parseDifficulty(text: string): Difficulty {
	const match = text.match(/\[(?:difficulty|diff|d)\s*:\s*(passive|pass|easy|challenging|chall|hardcore|hardc|hc|madhouse|mad)\]/i);
	if (!match) return Difficulty.Passive;

	const raw = match[1].toLowerCase();
	switch (raw) {
		case "pass":
		case "passive":
			return Difficulty.Passive;
		case "easy":
			return Difficulty.Easy;
		case "chall":
		case "challenging":
			return Difficulty.Challenging;
		case "hc":
		case "hardc":
		case "hardcore":
			return Difficulty.Hardcore;
		case "mad":
		case "madhouse":
			return Difficulty.Madhouse;
		default:
			return Difficulty.Passive;
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
	// 1. Remove checkbox prefix
	let text = line.replace(/^[\s]*[-*]\s\[[ xX]\]\s*/, "");
	
	// 2. Remove Obsidian comments (%%...%%) - handles inline TickTick IDs
	text = text.replace(/%%.*?%%/g, "");
	
	// 3. Remove inline metadata brackets (LifeRPG fields)
	// We use a more inclusive regex for the content inside brackets to catch all metadata fields
	text = text.replace(/\[(?:difficulty|diff|d|skill|s|deadline|due|dl|id|m|mental|p|physical|w|willpower|type|heading)\s*:[^\]]*\]/gi, "");
	
	// 4. Remove Dataview-style inline fields (including lone ticktick_id)
	text = text.replace(/\[[a-z0-9_]+\s*::\s*[^\]]*\]/gi, "");
	
	// 5. Remove priority emojis 
	text = text.replace(/[🔺⏫🔼🔽⏬⏺️]/g, "");
	
	// 6. Remove hashtags (#tag) - handles cases like #ticktick
	text = text.replace(/(^|\s)#[a-zA-Z0-9_\-]+/g, "$1");
	
	// 7. Remove Obsidian block IDs (^blockid)
	text = text.replace(/\s\^[a-z0-9-]+$/i, "");
	
	// 8. Final cleanup: collapse extra spaces and trim
	return text.replace(/\s{2,}/g, " ").trim();
}
