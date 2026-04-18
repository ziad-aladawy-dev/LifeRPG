// ============================================================================
// Life RPG — Stats Panel
// Renders the character's HP bar, XP bar, GP balance, and level.
// ============================================================================

import { setIcon } from "obsidian";
import { type CharacterState, type AttributeState } from "../../types";
import { formatNumber, percentage } from "../../utils/formatter";
import { getCharacterRank } from "../../engine/ClassSystem";

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
		const avatarContainer = header.createDiv({ cls: "life-rpg-char-avatar" });

		if (character.avatarUrl && (character.avatarUrl.startsWith("http") || character.avatarUrl.startsWith("data:image/"))) {
			avatarContainer.createEl("img", {
				attr: { src: character.avatarUrl, alt: "Avatar" },
				cls: "life-rpg-char-avatar-img"
			});
		} else {
			avatarContainer.setText(character.avatarUrl || "⚔️");
		}

		const headerInfo = header.createDiv({ cls: "life-rpg-char-info", attr: { style: "display: flex; flex-direction: column; gap: 4px; flex-grow: 1;" } });
		
		const nameRow = headerInfo.createDiv({ attr: { style: "display: flex; align-items: center; justify-content: space-between;" } });
		nameRow.createEl("h2", {
			text: character.name,
			cls: "life-rpg-char-name",
			attr: { style: "margin: 0; font-size: 24px; font-weight: 800; color: var(--rpg-text-primary);" }
		});

		const editBtn = nameRow.createEl("button", {
			text: "✏️ Edit Profile",
			cls: "life-rpg-btn life-rpg-btn-small",
		});

		editBtn.addEventListener("click", () => {
			this.showEditProfileForm(character, header);
		});

		const metaRow = headerInfo.createDiv({ attr: { style: "display: flex; flex-direction: column; gap: 2px;" } });
		metaRow.createEl("span", {
			text: `Level ${character.level}`,
			cls: "life-rpg-char-level",
			attr: { style: "font-weight: 600; color: var(--rpg-text-secondary); font-size: 14px;" }
		});

		const rankTitle = getCharacterRank(character.level, character.classId);
		metaRow.createEl("span", {
			text: rankTitle.toUpperCase(),
			cls: "life-rpg-char-class",
			attr: { style: "font-size: 12px; font-weight: 700; color: var(--rpg-accent); letter-spacing: 0.5px;" }
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
		const gpIcon = gpSection.createEl("span", { cls: "life-rpg-gp-icon" });
		setIcon(gpIcon, "coins");
		gpSection.createEl("span", {
			text: `${formatNumber(character.gp)} Gold`,
			cls: "life-rpg-gp-value",
		});

		const statsGrid = el.createDiv({ cls: "life-rpg-quick-stats" });
		this.createQuickStat(statsGrid, "Level", character.level.toString(), "medal");
		this.createQuickStat(statsGrid, "Max HP", character.maxHp.toString(), "shield");
		this.createQuickStat(
			statsGrid,
			"Next Lv",
			`${formatNumber(character.xpToNextLevel - character.xp)} XP`,
			"arrow-up-circle"
		);

		// Core Attributes Grid
		const attrSection = el.createDiv({ cls: "life-rpg-attributes-section" });
		attrSection.createEl("h4", { text: "🧬 Core Attributes", cls: "life-rpg-attributes-title" });
		
		const attrGrid = attrSection.createDiv({ cls: "life-rpg-attributes-grid" });
		
		this.createAttributeCard(attrGrid, "Strength", "STR", "sword", character.attributes.str);
		this.createAttributeCard(attrGrid, "Intelligence", "INT", "brain", character.attributes.int);
		this.createAttributeCard(attrGrid, "Wisdom", "WIS", "feather", character.attributes.wis);
		this.createAttributeCard(attrGrid, "Charisma", "CHA", "crown", character.attributes.cha);
	}

	private createAttributeCard(parent: HTMLElement, name: string, shortName: string, icon: string, attr: AttributeState): void {
		const card = parent.createDiv({ cls: "life-rpg-attribute-card" });
		
		const header = card.createDiv({ cls: "life-rpg-attr-header" });
		const title = header.createDiv({ cls: "life-rpg-attr-title" });
		const iconEl = title.createEl("span", { cls: "life-rpg-attr-icon" });
		setIcon(iconEl, icon);
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
		const iconEl = stat.createEl("span", { cls: "life-rpg-quick-stat-icon" });
		setIcon(iconEl, icon);
		stat.createEl("span", { text: value, cls: "life-rpg-quick-stat-value" });
		stat.createEl("span", { text: label, cls: "life-rpg-quick-stat-label" });
	}

	private showEditProfileForm(character: CharacterState, headerBlock: HTMLElement): void {
		const children = Array.from(headerBlock.children);
		children.forEach(c => ((c as HTMLElement).style.display = "none"));

		const form = headerBlock.createDiv({ cls: "life-rpg-edit-profile-form life-rpg-form", attr: { style: "width: 100%;" } });

		const nameInput = form.createEl("input", {
			type: "text",
			value: character.name,
			placeholder: "Character Name",
			cls: "life-rpg-input",
		});

		const avatarRow = form.createDiv({ cls: "life-rpg-form-row" });
		avatarRow.createEl("label", { text: "Avatar (Emoji or URL):" });
		const avatarInput = avatarRow.createEl("input", {
			type: "text",
			value: character.avatarUrl,
			placeholder: "⚔️",
			cls: "life-rpg-input",
		});

		const btnGroup = form.createDiv({ cls: "life-rpg-btn-group" });
		const saveBtn = btnGroup.createEl("button", {
			text: "Save",
			cls: "life-rpg-btn life-rpg-btn-primary",
		});
		const cancelBtn = btnGroup.createEl("button", {
			text: "Cancel",
			cls: "life-rpg-btn",
		});

		saveBtn.addEventListener("click", () => {
			const name = nameInput.value.trim() || "Hero";
			const avatarUrl = avatarInput.value.trim() || "⚔️";

			this.stateManager.updateCharacter({
				name,
				avatarUrl
			});
		});

		cancelBtn.addEventListener("click", () => {
			form.remove();
			children.forEach(c => ((c as HTMLElement).style.display = ""));
		});

		nameInput.focus();
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
