// ============================================================================
// Life RPG — Stats Panel
// Renders the character's HP bar, XP bar, GP balance, and level.
// ============================================================================

import { type CharacterState, type AttributeState } from "../../types";
import { formatNumber, percentage } from "../../utils/formatter";

export class StatsPanel {
	private containerEl: HTMLElement;

	constructor(parentEl: HTMLElement) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-stats-panel" });
	}

	render(character: CharacterState): void {
		const el = this.containerEl;
		el.empty();

		// Character Header
		const header = el.createDiv({ cls: "life-rpg-char-header" });
		header.createEl("div", {
			cls: "life-rpg-char-avatar",
			text: "⚔️",
		});
		const headerInfo = header.createDiv({ cls: "life-rpg-char-info" });
		headerInfo.createEl("h3", {
			text: `Level ${character.level} Hero`,
			cls: "life-rpg-char-title",
		});
		headerInfo.createEl("span", {
			text: `Adventurer`,
			cls: "life-rpg-char-class",
		});

		// HP Bar
		const hpSection = el.createDiv({ cls: "life-rpg-stat-section" });
		const hpHeader = hpSection.createDiv({ cls: "life-rpg-stat-header" });
		hpHeader.createEl("span", { text: "❤️ Health", cls: "life-rpg-stat-label" });
		hpHeader.createEl("span", {
			text: `${formatNumber(character.hp)} / ${formatNumber(character.maxHp)}`,
			cls: "life-rpg-stat-value",
		});

		const hpBarContainer = hpSection.createDiv({ cls: "life-rpg-bar-container" });
		const hpBar = hpBarContainer.createDiv({ cls: "life-rpg-bar life-rpg-bar-hp" });
		const hpPct = percentage(character.hp, character.maxHp);
		hpBar.style.width = `${hpPct}%`;

		// Color coding: green > 60%, yellow 30-60%, red < 30%
		if (hpPct > 60) {
			hpBar.addClass("life-rpg-bar-hp-high");
		} else if (hpPct > 30) {
			hpBar.addClass("life-rpg-bar-hp-mid");
		} else {
			hpBar.addClass("life-rpg-bar-hp-low");
		}

		// XP Bar
		const xpSection = el.createDiv({ cls: "life-rpg-stat-section" });
		const xpHeader = xpSection.createDiv({ cls: "life-rpg-stat-header" });
		xpHeader.createEl("span", { text: "✨ Experience", cls: "life-rpg-stat-label" });
		xpHeader.createEl("span", {
			text: `${formatNumber(character.xp)} / ${formatNumber(character.xpToNextLevel)}`,
			cls: "life-rpg-stat-value",
		});

		const xpBarContainer = xpSection.createDiv({ cls: "life-rpg-bar-container" });
		const xpBar = xpBarContainer.createDiv({ cls: "life-rpg-bar life-rpg-bar-xp" });
		xpBar.style.width = `${percentage(character.xp, character.xpToNextLevel)}%`;

		// GP Display
		const gpSection = el.createDiv({ cls: "life-rpg-gp-section" });
		gpSection.createEl("span", { text: "💰", cls: "life-rpg-gp-icon" });
		gpSection.createEl("span", {
			text: `${formatNumber(character.gp)} Gold`,
			cls: "life-rpg-gp-value",
		});

		const statsGrid = el.createDiv({ cls: "life-rpg-quick-stats" });
		this.createQuickStat(statsGrid, "Level", character.level.toString(), "🏅");
		this.createQuickStat(statsGrid, "Max HP", character.maxHp.toString(), "🛡️");
		this.createQuickStat(
			statsGrid,
			"Next Lv",
			`${formatNumber(character.xpToNextLevel - character.xp)} XP`,
			"⬆️"
		);

		// Core Attributes Grid
		const attrSection = el.createDiv({ cls: "life-rpg-attributes-section" });
		attrSection.createEl("h4", { text: "🧬 Core Attributes", cls: "life-rpg-attributes-title" });
		
		const attrGrid = attrSection.createDiv({ cls: "life-rpg-attributes-grid" });
		
		this.createAttributeCard(attrGrid, "Strength", "STR", "🦾", character.attributes.str);
		this.createAttributeCard(attrGrid, "Intelligence", "INT", "🧠", character.attributes.int);
		this.createAttributeCard(attrGrid, "Constitution", "CON", "🫀", character.attributes.con);
		this.createAttributeCard(attrGrid, "Charisma", "CHA", "👑", character.attributes.cha);
	}

	private createAttributeCard(parent: HTMLElement, name: string, shortName: string, icon: string, attr: AttributeState): void {
		const card = parent.createDiv({ cls: "life-rpg-attribute-card" });
		
		const header = card.createDiv({ cls: "life-rpg-attr-header" });
		const title = header.createDiv({ cls: "life-rpg-attr-title" });
		title.createEl("span", { text: icon, cls: "life-rpg-attr-icon" });
		title.createEl("span", { text: name, cls: "life-rpg-attr-name" });
		
		header.createEl("span", { text: `Lv.${attr.level}`, cls: "life-rpg-attr-level" });

		const barContainer = card.createDiv({ cls: "life-rpg-bar-container life-rpg-bar-container-tiny" });
		const bar = barContainer.createDiv({ cls: "life-rpg-bar life-rpg-bar-attr" });
		bar.style.width = `${percentage(attr.xp, attr.xpToNextLevel)}%`;
	}

	private createQuickStat(
		parent: HTMLElement,
		label: string,
		value: string,
		icon: string
	): void {
		const stat = parent.createDiv({ cls: "life-rpg-quick-stat" });
		stat.createEl("span", { text: icon, cls: "life-rpg-quick-stat-icon" });
		stat.createEl("span", { text: value, cls: "life-rpg-quick-stat-value" });
		stat.createEl("span", { text: label, cls: "life-rpg-quick-stat-label" });
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
