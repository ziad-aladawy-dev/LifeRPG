/**
 * Standardized date utilities for Life RPG.
 * Ensures consistent 'YYYY-MM-DD' format across all state checks.
 */

/** Return today's date in local YYYY-MM-DD format */
export function getTodayStr(): string {
	return formatDate(new Date());
}

/** Format a Date object as local YYYY-MM-DD */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Check if two ISO strings or date strings fall on the same calendar day */
export function isSameDay(date1: string | null, date2: string | null): boolean {
	if (!date1 || !date2) return false;
	const d1 = date1.includes("T") ? date1.split("T")[0] : date1;
	const d2 = date2.includes("T") ? date2.split("T")[0] : date2;
	return d1 === d2;
}

