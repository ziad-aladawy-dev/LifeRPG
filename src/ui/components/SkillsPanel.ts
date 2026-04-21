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
		const titleContainer = header.createDiv({ cls: "life-rpg-title-with-sp" });
		titleContainer.createEl("h3", { text: "🎯 Skills" });
		
		const spDisplay = titleContainer.createDiv({ cls: "life-rpg-sp-badge" });
		spDisplay.createEl("span", { text: "SP: ", cls: "life-rpg-sp-label" });
		spDisplay.createEl("span", { text: this.stateManager.getSkillPoints().toString(), cls: "life-rpg-sp-value" });

		const btnGroup = header.createDiv({ cls: "life-rpg-panel-btn-group" });
		
		const treeBtn = btnGroup.createEl("button", {
			text: "🌳 Tree",
			cls: "life-rpg-btn life-rpg-btn-small life-rpg-btn-tree",
		});
		treeBtn.title = "Open Skill Tree";
		treeBtn.onclick = () => {
			// Trigger tab change in CharacterSheetView via state event or similar
			// For now, assume user can switch tabs, but we can emit a custom event
			(this.stateManager as any).plugin.app.workspace.trigger("life-rpg:switch-tab", "skills_tree");
		};

		const addBtn = btnGroup.createEl("button", {
			text: "+ Skill",
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

		// Skills list grouped by attribute
		const list = el.createDiv({ cls: "life-rpg-skills-list" });
		
		const attributes = [
			{ id: Attribute.STR, name: "Strength", icon: "🦾", cls: "life-rpg-skill-group-str" },
			{ id: Attribute.INT, name: "Intelligence", icon: "🧠", cls: "life-rpg-skill-group-int" },
			{ id: Attribute.WIS, name: "Wisdom", icon: "🕊️", cls: "life-rpg-skill-group-wis" },
			{ id: Attribute.CHA, name: "Charisma", icon: "👑", cls: "life-rpg-skill-group-cha" },
		];

		const otherSkills = skills.filter(s => !s.attribute);

		for (const attr of attributes) {
			const attrSkills = skills.filter(s => s.attribute === attr.id);
			if (attrSkills.length > 0) {
				const groupHeader = list.createDiv({ cls: `life-rpg-skill-group-header ${attr.cls}` });
				groupHeader.createEl("span", { text: attr.icon, cls: "life-rpg-group-icon" });
				groupHeader.createEl("span", { text: attr.name, cls: "life-rpg-group-name" });
				
				for (const skill of attrSkills) {
					this.renderSkillCard(list, skill);
				}
			}
		}

		if (otherSkills.length > 0) {
			const groupHeader = list.createDiv({ cls: "life-rpg-skill-group-header life-rpg-skill-group-other" });
			groupHeader.createEl("span", { text: "📦", cls: "life-rpg-group-icon" });
			groupHeader.createEl("span", { text: "Other", cls: "life-rpg-group-name" });
			
			for (const skill of otherSkills) {
				this.renderSkillCard(list, skill);
			}
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

		const actions = cardHeader.createDiv({ cls: "life-rpg-skill-actions", attr: { style: "display: flex; gap: 4px;" } });

		// Edit button
		const editBtn = actions.createEl("button", {
			text: "✏️",
			cls: "life-rpg-btn-icon",
		});
		editBtn.addEventListener("click", () => {
			this.showEditSkillForm(skill, card, cardHeader, barSection);
		});
		
		// Delete button
		const deleteBtn = actions.createEl("button", {
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

	private showEditSkillForm(skill: Skill, card: HTMLElement, header: HTMLElement, bar: HTMLElement): void {
		header.style.display = "none";
		bar.style.display = "none";

		const form = card.createDiv({ cls: "life-rpg-add-skill-form" });

		const nameInput = form.createEl("input", {
			type: "text",
			value: skill.name,
			placeholder: "Skill name",
			cls: "life-rpg-input",
		});

		const iconInput = form.createEl("input", {
			type: "text",
			value: skill.icon,
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.width = "120px";

		// Attribute Selector
		const attrSelect = form.createEl("select", { cls: "life-rpg-input life-rpg-input-small" });
		attrSelect.style.width = "100px";
		const attrs = [
			{text: "🦾 Strength", value: Attribute.STR},
			{text: "🧠 Intelligence", value: Attribute.INT},
			{text: "🕊️ Wisdom", value: Attribute.WIS},
			{text: "👑 Charisma", value: Attribute.CHA}
		];
		for (const a of attrs) {
			const option = attrSelect.createEl("option", { text: a.text, value: a.value });
			if (a.value === skill.attribute) option.selected = true;
		}

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
			const name = nameInput.value.trim();
			if (name) {
				const icon = iconInput.value.trim() || "star";
				this.stateManager.updateSkill(skill.id, {
					name,
					icon,
					attribute: attrSelect.value as Attribute,
				});
			}
		});

		cancelBtn.addEventListener("click", () => {
			form.remove();
			header.style.display = "flex";
			bar.style.display = "flex";
		});

		nameInput.focus();
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
