import { setIcon } from "obsidian";

/**
 * Renders an icon into a container. 
 * Correctly distinguishes between Lucide icon IDs and emojis.
 */
export function renderIcon(container: HTMLElement, icon: string): void {
	if (!icon) return;
	
	// Check if it's a potential Lucide icon ID (alphanumeric with hyphens)
	// Emojis usually contain non-ASCII characters or are just single characters.
	const isLucide = /^[a-z0-9\-]+$/.test(icon) && icon.length >= 3;
	
	if (isLucide) {
		setIcon(container, icon);
	} else {
		// Just text (likely emoji)
		container.setText(icon);
	}
}

/**
 * Creates and renders a badge with an icon and text.
 */
export function renderBadge(parent: HTMLElement, text: string, icon?: string, cls?: string): HTMLElement {
	const badge = parent.createEl("span", { cls: `life-rpg-quest-badge ${cls || ""}` });
	
	if (icon) {
		const iconWrapper = badge.createEl("span", { cls: "life-rpg-badge-icon-wrapper" });
		renderIcon(iconWrapper, icon);
	}
	
	badge.createEl("span", { text: text, cls: "life-rpg-badge-text" });
	
	return badge;
}
