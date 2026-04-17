/**
 * Standardized date utilities for Life RPG.
 * Ensures consistent 'YYYY-MM-DD' format across all state checks.
 */

/** Return today's date in YYYY-MM-DD format */
export function getTodayStr(): string {
	return new Date().toISOString().split("T")[0];
}

/** Check if two ISO strings or date strings fall on the same calendar day */
export function isSameDay(date1: string | null, date2: string | null): boolean {
	if (!date1 || !date2) return false;
	const d1 = date1.split("T")[0];
	const d2 = date2.split("T")[0];
	return d1 === d2;
}
