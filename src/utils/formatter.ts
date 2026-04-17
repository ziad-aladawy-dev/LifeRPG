// ============================================================================
// Life RPG — Utility: Formatters
// Number formatting, time helpers, and display utilities.
// ============================================================================

/**
 * Format a number with commas for display.
 * Example: 1234 → "1,234"
 */
export function formatNumber(n: number): string {
	return n.toLocaleString("en-US");
}

/**
 * Format a timestamp as a relative time string.
 * Example: "2 hours ago", "just now"
 */
export function formatRelativeTime(isoString: string): string {
	const date = new Date(isoString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHr = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHr / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});
}

/**
 * Format a date string for display.
 * Example: "Apr 17, 2026"
 */
export function formatDate(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Calculate percentage, clamped to [0, 100].
 */
export function percentage(current: number, max: number): number {
	if (max <= 0) return 0;
	return Math.min(100, Math.max(0, (current / max) * 100));
}

/**
 * Format a percentage for display.
 * Example: 0.756 → "75.6%"
 */
export function formatPercentage(current: number, max: number): string {
	return `${percentage(current, max).toFixed(1)}%`;
}

/**
 * Truncate a string to a maximum length, adding "..." if truncated.
 */
export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	return str.substring(0, maxLen - 3) + "...";
}
