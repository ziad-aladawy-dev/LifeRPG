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
	const result: any = {};
	
	const energy = parseEnergyScores(lineText);
	if (energy.energyM !== undefined) result.energyM = energy.energyM;
	if (energy.energyP !== undefined) result.energyP = energy.energyP;
	if (energy.energyW !== undefined) result.energyW = energy.energyW;

	const diff = parseDifficulty(lineText);
	if (diff !== undefined) result.difficulty = diff;

	const skillId = parseSkillId(lineText);
	if (skillId !== undefined) result.skillId = skillId;

	const deadline = parseDeadline(lineText);
	if (deadline !== undefined) result.deadline = deadline;

	const prio = parsePriority(lineText);
	if (prio !== undefined) result.priority = prio;

	const isHeading = parseIsHeading(lineText);
	if (isHeading !== undefined) result.isHeading = isHeading;

	return result as TaskMetadata;
}

/**
 * Extract energy scores from bracketed metadata.
 * Supports: [m: 5], [p: 2], [w: 1] OR [m: 5, p: 2, w: 1]
 */
function parseEnergyScores(text: string): { energyM?: number, energyP?: number, energyW?: number } {
	const result: { energyM?: number, energyP?: number, energyW?: number } = {};
	
	// Individual matches
	const mMatch = text.match(/\[(?:mental|m)\s*:\s*(\d+)\]/i);
	if (mMatch) {
		const val = parseInt(mMatch[1]);
		if (!isNaN(val)) result.energyM = Math.min(5, Math.max(0, val));
	}
	
	const pMatch = text.match(/\[(?:physical|p)\s*:\s*(\d+)\]/i);
	if (pMatch) {
		const val = parseInt(pMatch[1]);
		if (!isNaN(val)) result.energyP = Math.min(5, Math.max(0, val));
	}
	
	const wMatch = text.match(/\[(?:willpower|w)\s*:\s*(\d+)\]/i);
	if (wMatch) {
		const val = parseInt(wMatch[1]);
		if (!isNaN(val)) result.energyW = Math.min(5, Math.max(0, val));
	}
	
	// Composite match: [m: 5, p: 2, w: 1]
	const compositeMatch = text.match(/\[(?:mental|physical|willpower|m|p|w)\s*:[^\]]+\]/gi);
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
function parseIsHeading(text: string): boolean | undefined {
	if (!/\[(?:type|heading)\s*:\s*(heading|true)/i.test(text)) return undefined;
	return true;
}

/**
 * Extract difficulty from inline text.
 * Matches: [difficulty: easy], [diff: medium], [d: hard]
 */
function parseDifficulty(text: string): Difficulty | undefined {
	const match = text.match(/\[(?:difficulty|diff|d)\s*:\s*(passive|pass|easy|challenging|chall|hardcore|hardc|hc|madhouse|mad)\]/i);
	if (!match) return undefined;

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
			return undefined;
	}
}

/**
 * Extract skill ID from inline text.
 * Matches: [skill: Programming], [s: Fitness]
 */
function parseSkillId(text: string): string | undefined {
	const match = text.match(/\[(?:skill|s)\s*:\s*([^\]]+)\]/i);
	if (!match) return undefined;
	return match[1].trim();
}

/**
 * Extract deadline from inline text.
 * Matches: [deadline: 2026-04-20], [due: 2026-04-20]
 * Returns date string in YYYY-MM-DD format (handles local timezone correctly).
 */
function parseDeadline(text: string): string | undefined {
	const match = text.match(
		/\[(?:deadline|due|dl)\s*:\s*(\d{4}-\d{2}-\d{2})\]/i
	);
	if (!match) return undefined;

	const dateStr = match[1]; // e.g., "2026-04-20"
	
	// Validate it's a valid date by parsing and back-formatting
	const [year, month, day] = dateStr.split("-").map(Number);
	if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
		return undefined;
	}
	
	// Return as YYYY-MM-DD (no timezone issues with string comparison)
	return dateStr;
}

/**
 * Extract Obsidian Tasks priority emoji.
 */
function parsePriority(text: string): TaskPriority | undefined {
	if (text.includes("🔺")) return TaskPriority.Highest;
	if (text.includes("⏫")) return TaskPriority.High;
	if (text.includes("🔼")) return TaskPriority.Medium;
	if (text.includes("🔽")) return TaskPriority.Low;
	if (text.includes("⏬")) return TaskPriority.Lowest;
	return undefined;
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
