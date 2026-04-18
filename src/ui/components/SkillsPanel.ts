// ============================================================================
// Life RPG — Skills Panel
// Renders skill list with individual XP progress bars.
// ============================================================================

import { setIcon } from "obsidian";
import { type Skill, Attribute } from "../../types";
import { formatNumber, percentage } from "../../utils/formatter";
import { generateId, xpThresholdForSkillLevel } from "../../constants";
import { type StateManager } from "../../state/StateManager";

export class SkillsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-skills-panel" });
		this.stateManager = stateManager;
	}

	render(skills: Skill[]): void {
		const el = this.containerEl;
		el.empty();

		// Header with Add button
		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "📊 Skills" });
		const addBtn = header.createEl("button", {
			text: "+ Add Skill",
			cls: "life-rpg-btn life-rpg-btn-small",
		});
		addBtn.addEventListener("click", () => this.showAddSkillInput());

		if (skills.length === 0) {
			el.createDiv({
				cls: "life-rpg-empty-state",
				text: "No skills yet. Add your first skill to start tracking!",
			});
			return;
		}

		// Skills list
		const list = el.createDiv({ cls: "life-rpg-skills-list" });
		for (const skill of skills) {
			this.renderSkillCard(list, skill);
		}
	}

	private renderSkillCard(parent: HTMLElement, skill: Skill): void {
		const card = parent.createDiv({ cls: "life-rpg-skill-card" });

		const cardHeader = card.createDiv({ cls: "life-rpg-skill-header" });
		const info = cardHeader.createDiv({ cls: "life-rpg-skill-info" });
		const nameSpan = info.createEl("span", {
			cls: "life-rpg-skill-name",
		});
		const iconEl = nameSpan.createEl("span", { cls: "life-rpg-skill-icon" });
		if (/^[a-z0-9-]+$/.test(skill.icon)) {
			setIcon(iconEl, skill.icon);
		} else {
			iconEl.setText(skill.icon);
		}
		nameSpan.createEl("span", { text: ` ${skill.name}` });
		
		const attrDisplayMap: Record<string, string> = {
			str: '🦾', int: '🧠', wis: '🕊️', cha: '👑'
		};
		const attrIcon = skill.attribute ? attrDisplayMap[skill.attribute] : '';

		info.createEl("span", {
			text: `Lv. ${skill.level} ${attrIcon ? '| ' + attrIcon : ''}`,
			cls: "life-rpg-skill-level",
		});

		// Delete button
		const deleteBtn = cardHeader.createEl("button", {
			text: "✕",
			cls: "life-rpg-btn-icon life-rpg-btn-danger-subtle",
		});
		deleteBtn.addEventListener("click", () => {
			if (confirm(`Remove skill "${skill.name}"?`)) {
				this.stateManager.removeSkill(skill.id);
			}
		});

		// XP bar
		const barSection = card.createDiv({ cls: "life-rpg-skill-bar-section" });
		const barContainer = barSection.createDiv({
			cls: "life-rpg-bar-container life-rpg-bar-container-small",
		});
		const bar = barContainer.createDiv({
			cls: "life-rpg-bar life-rpg-bar-skill",
		});
		bar.style.width = `${percentage(skill.xp, skill.xpToNextLevel)}%`;

		barSection.createEl("span", {
			text: `${formatNumber(skill.xp)} / ${formatNumber(skill.xpToNextLevel)} XP`,
			cls: "life-rpg-skill-xp-text",
		});
	}

	private showAddSkillInput(): void {
		const el = this.containerEl;

		// Check if input already exists
		if (el.querySelector(".life-rpg-add-skill-form")) return;

		const form = el.createDiv({ cls: "life-rpg-add-skill-form" });

		const nameInput = form.createEl("input", {
			type: "text",
			placeholder: "Skill name (e.g., Programming)",
			cls: "life-rpg-input",
		});

		const iconInput = form.createEl("input", {
			type: "text",
			placeholder: "Icon (e.g., 'code' or 💻)",
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.width = "120px";
		iconInput.title = "Can be an emoji or a Lucide icon name like 'code', 'book', 'dumbbell'";

		// Attribute Selector
		const attrSelect = form.createEl("select", { cls: "life-rpg-input life-rpg-input-small" });
		attrSelect.style.width = "100px";
		attrSelect.createEl("option", { text: "🦾 Strength", value: Attribute.STR });
		attrSelect.createEl("option", { text: "🧠 Intelligence", value: Attribute.INT });
		attrSelect.createEl("option", { text: "🕊️ Wisdom", value: Attribute.WIS });
		attrSelect.createEl("option", { text: "👑 Charisma", value: Attribute.CHA });

		const btnGroup = form.createDiv({ cls: "life-rpg-btn-group" });
		const saveBtn = btnGroup.createEl("button", {
			text: "Add",
			cls: "life-rpg-btn life-rpg-btn-primary",
		});
		const cancelBtn = btnGroup.createEl("button", {
			text: "Cancel",
			cls: "life-rpg-btn",
		});

		saveBtn.addEventListener("click", () => {
			const name = nameInput.value.trim();
			if (name) {
				const icon = iconInput.value.trim() || "star";
				this.stateManager.addSkill({
					id: generateId(),
					name,
					icon,
					level: 1,
					xp: 0,
					xpToNextLevel: xpThresholdForSkillLevel(1),
					attribute: attrSelect.value as Attribute,
				});
			}
			form.remove();
		});

		cancelBtn.addEventListener("click", () => form.remove());
		nameInput.focus();
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
