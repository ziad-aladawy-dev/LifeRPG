// ============================================================================
// Life RPG — Stats Panel (Character Hub)
// Unified panel with mode toggle: Attributes | Mastery | Inventory
// Avatar click opens Profile modal.
// ============================================================================

import { App, setIcon } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { type CharacterState, type AttributeState, type Skill, type Item, type GameState, Attribute, ItemSlot, ItemRarity } from "../../types";
import { formatNumber, percentage } from "../../utils/formatter";
import { getCharacterRank } from "../../engine/ClassSystem";
import { SKILL_TREE_NODES, generateId, xpThresholdForSkillLevel } from "../../constants";
import { ProfileModal } from "../modals/ProfileModal";

type StatsMode = "attributes" | "mastery" | "inventory";

export class StatsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;
	private app: App;
	private prevValues: Map<string, number> = new Map();
	private activeMode: StatsMode = "attributes";

	constructor(parentEl: HTMLElement, stateManager: StateManager, app: App) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-stats-panel" });
		this.stateManager = stateManager;
		this.app = app;
	}

	render(state: GameState): void {
		const character = state.character;

		// Detect changes for floating numbers
		this.checkAndSpawnDelta(character.hp, "hp", "❤️");
		this.checkAndSpawnDelta(character.xp, "xp", "✨");
		this.checkAndSpawnDelta(character.gp, "gp", "💰");

		this.prevValues.set("hp", character.hp);
		this.prevValues.set("xp", character.xp);
		this.prevValues.set("gp", character.gp);

		const el = this.containerEl;
		el.empty();
		el.addClass("life-rpg-stats-container");

		// --- TOP SECTION: RADAR CHART ---
		const radarSection = el.createDiv({ cls: "life-rpg-radar-section" });
		const canvas = radarSection.createEl("canvas", { 
			cls: "life-rpg-radar-canvas",
			attr: { width: "600", height: "280" } 
		});
		this.drawRadarChart(canvas, character.attributes as unknown as Record<string, AttributeState>);

		// --- PROFILE SECTION (clickable avatar) ---
		const profileSection = el.createDiv({ cls: "life-rpg-stats-profile" });
		
		const avatarContainer = profileSection.createDiv({ cls: "life-rpg-stats-avatar life-rpg-avatar-clickable" });
		if (character.avatarUrl && (character.avatarUrl.startsWith("http") || character.avatarUrl.startsWith("data:image/"))) {
			avatarContainer.createEl("img", { attr: { src: character.avatarUrl }, cls: "life-rpg-avatar-img" });
		} else {
			avatarContainer.setText(character.avatarUrl || "⚔️");
		}

		// Edit overlay hint
		const editOverlay = avatarContainer.createDiv({ cls: "life-rpg-avatar-edit-overlay" });
		editOverlay.setText("✏️");

		// Click → open profile modal
		avatarContainer.addEventListener("click", () => {
			new ProfileModal(this.app, this.stateManager).open();
		});

		const nameContainer = profileSection.createDiv({ cls: "life-rpg-stats-name-group" });
		nameContainer.createEl("h2", { text: character.name, cls: "life-rpg-stats-name" });
		const rankTitle = getCharacterRank(character.level, character.classId);
		nameContainer.createEl("span", { text: `${rankTitle} • Level ${character.level}`, cls: "life-rpg-stats-rank" });

		// --- RESOURCE BARS SECTION ---
		const resourceSection = el.createDiv({ cls: "life-rpg-resource-section" });
		
		const modifiers = this.stateManager.getGlobalModifiers();
		const finalMaxHp = character.maxHp + (modifiers.hpMax || 0);
		
		this.renderResourceBar(resourceSection, "Health", character.hp, finalMaxHp, "hp");
		this.renderResourceBar(resourceSection, "Experience", character.xp, character.xpToNextLevel, "xp");

		// --- FLOATING GOLD ---
		const goldPocket = el.createDiv({ cls: "life-rpg-gold-pocket" });
		setIcon(goldPocket.createEl("span"), "coins");
		goldPocket.createEl("span", { text: `${formatNumber(character.gp)} GP` });

		// --- MODE TOGGLE ---
		this.renderModeToggle(el);

		// --- TOGGLED CONTENT ---
		const contentArea = el.createDiv({ cls: "life-rpg-hub-content" });
		
		switch (this.activeMode) {
			case "attributes":
				this.renderAttributesContent(contentArea, character, state);
				break;
			case "mastery":
				this.renderMasteryContent(contentArea, state.skills);
				break;
			case "inventory":
				this.renderInventoryContent(contentArea);
				break;
		}
	}

	// ─── Mode Toggle ───────────────────────────────────────────────────

	private renderModeToggle(parent: HTMLElement): void {
		const toggleBar = parent.createDiv({ cls: "life-rpg-mode-toggle" });

		const modes: { id: StatsMode; label: string; icon: string }[] = [
			{ id: "attributes", label: "Attributes", icon: "⚔️" },
			{ id: "mastery", label: "Mastery", icon: "🎯" },
			{ id: "inventory", label: "Inventory", icon: "🎒" },
		];

		for (const mode of modes) {
			const btn = toggleBar.createEl("button", {
				cls: `life-rpg-mode-btn ${this.activeMode === mode.id ? "life-rpg-mode-active" : ""}`,
			});
			btn.setAttribute("data-mode", mode.id);
			btn.createEl("span", { text: mode.icon, cls: "life-rpg-mode-icon" });
			btn.createEl("span", { text: mode.label, cls: "life-rpg-mode-label" });

			btn.addEventListener("click", () => {
				if (this.activeMode !== mode.id) {
					this.activeMode = mode.id;
					this.render(this.stateManager.getState());
				}
			});
		}
	}

	// ─── Attributes Content ────────────────────────────────────────────

	private renderAttributesContent(parent: HTMLElement, character: CharacterState, state: GameState): void {
		const attrsGrid = parent.createDiv({ cls: "life-rpg-attrs-grid" });
		const modifiers = this.stateManager.getGlobalModifiers();

		const attrConfigs = [
			{ id: "str", name: "Strength", icon: "💪", color: "var(--rpg-str)" },
			{ id: "int", name: "Intelligence", icon: "🧠", color: "var(--rpg-int)" },
			{ id: "wis", name: "Wisdom", icon: "🫀", color: "var(--rpg-wis)" },
			{ id: "cha", name: "Charisma", icon: "👑", color: "var(--rpg-cha)" }
		];

		for (const config of attrConfigs) {
			const attr = (character.attributes as any)[config.id];
			const mod = (modifiers as any)[config.id] || 0;
			this.renderAttributeCard(attrsGrid, config, attr, mod);
		}

		// Active Bonus Summary
		this.renderBonusSummary(parent, character, modifiers);
	}

	// ─── Mastery Content (Skills) ──────────────────────────────────────

	private renderMasteryContent(parent: HTMLElement, skills: Skill[]): void {
		// Header with SP display + buttons
		const header = parent.createDiv({ cls: "life-rpg-panel-header" });
		const titleContainer = header.createDiv({ cls: "life-rpg-title-with-sp" });
		titleContainer.createEl("h3", { text: "🎯 Skills" });
		
		const spDisplay = titleContainer.createDiv({ cls: "life-rpg-sp-badge" });
		const availableSP = this.stateManager.getSkillPoints();
		const totalSP = this.stateManager.getTotalSkillPoints();
		
		spDisplay.createEl("span", { text: "SP: ", cls: "life-rpg-sp-label" });
		spDisplay.createEl("span", { 
			text: `${availableSP} / ${totalSP}`, 
			cls: "life-rpg-sp-value",
			title: `Total SP earned from skill levels: ${totalSP}\nSpent SP: ${totalSP - availableSP}`
		});

		const btnGroup = header.createDiv({ cls: "life-rpg-panel-btn-group" });
		
		const treeBtn = btnGroup.createEl("button", {
			text: "🌳 Tree",
			cls: "life-rpg-btn life-rpg-btn-small life-rpg-btn-tree",
		});
		treeBtn.title = "Open Skill Tree";
		treeBtn.onclick = () => {
			(this.stateManager as any).plugin.app.workspace.trigger("life-rpg:switch-tab", "skills_tree");
		};

		const addBtn = btnGroup.createEl("button", {
			text: "+ Skill",
			cls: "life-rpg-btn life-rpg-btn-small",
		});
		addBtn.addEventListener("click", () => this.showAddSkillInput(parent));

		if (skills.length === 0) {
			parent.createDiv({
				cls: "life-rpg-empty-state",
				text: "No skills yet. Add your first skill to start tracking!",
			});
			return;
		}

		// Skills list grouped by attribute
		const list = parent.createDiv({ cls: "life-rpg-skills-list" });
		
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

	private showAddSkillInput(parent: HTMLElement): void {
		// Check if input already exists
		if (parent.querySelector(".life-rpg-add-skill-form")) return;

		const form = parent.createDiv({ cls: "life-rpg-add-skill-form" });

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

	// ─── Inventory Content ─────────────────────────────────────────────

	private renderInventoryContent(parent: HTMLElement): void {
		const inventory = this.stateManager.getInventory();
		const char = this.stateManager.getCharacter();

		// Header
		const header = parent.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "🎒 Inventory" });

		// Equipped Section
		const equippedSection = parent.createDiv({ cls: "life-rpg-equipped-section" });
		equippedSection.createEl("h4", { text: "🛡️ Equipped Gear", cls: "life-rpg-section-title" });
		const equippedGrid = equippedSection.createDiv({ cls: "life-rpg-equipped-grid" });

		const slots = [ItemSlot.Weapon, ItemSlot.Armor, ItemSlot.Accessory];
		for (const slot of slots) {
			const itemId = char.equippedItems[slot];
			const item = itemId ? (inventory.find(i => i.id === itemId) || null) : null;
			this.renderEquippedSlot(equippedGrid, slot, item);
		}

		// Items List
		const itemsSection = parent.createDiv({ cls: "life-rpg-items-section" });
		itemsSection.createEl("h4", { text: "📦 All Items", cls: "life-rpg-section-title" });
		
		if (inventory.length === 0) {
			itemsSection.createDiv({
				cls: "life-rpg-empty-state",
				text: "Your inventory is empty. Find items by completing habits or clearing dungeons!",
			});
			return;
		}

		const itemsGrid = itemsSection.createDiv({ cls: "life-rpg-items-grid" });
		for (const item of inventory) {
			const isEquipped = Object.values(char.equippedItems).includes(item.id);
			this.renderItemCard(itemsGrid, item, isEquipped);
		}
	}

	private renderEquippedSlot(parent: HTMLElement, slot: ItemSlot, item: Item | null): void {
		const slotEl = parent.createDiv({ cls: `life-rpg-slot-card ${!item ? "life-rpg-slot-empty" : ""}` });
		
		const label = slot.charAt(0).toUpperCase() + slot.slice(1);
		slotEl.createDiv({ text: label, cls: "life-rpg-slot-label" });

		if (item) {
			const itemInfo = slotEl.createDiv({ cls: "life-rpg-slot-item-info" });
			const iconEl = itemInfo.createEl("span", { cls: "life-rpg-slot-icon" });
			if (item.icon.startsWith("assets/")) {
				iconEl.style.backgroundImage = `url('${this.stateManager.getAssetPath(item.icon)}')`;
				iconEl.addClass("has-custom-img");
			} else if (/^[a-z0-9-]+$/.test(item.icon)) {
				setIcon(iconEl, item.icon);
			} else {
				iconEl.setText(item.icon);
			}
			itemInfo.createEl("span", { text: item.name, cls: "life-rpg-slot-item-name" });
			
			const unequipBtn = slotEl.createEl("button", {
				text: "Unequip",
				cls: "life-rpg-btn-subtle life-rpg-btn-xs",
			});
			unequipBtn.addEventListener("click", () => {
				this.stateManager.unequipItem(slot);
			});
		} else {
			slotEl.createDiv({ text: "Empty", cls: "life-rpg-slot-status" });
		}
	}

	private renderItemCard(parent: HTMLElement, item: Item, isEquipped: boolean): void {
		const card = parent.createDiv({ cls: `life-rpg-item-card rarity-${item.rarity.toLowerCase()}` });
		
		const header = card.createDiv({ cls: "life-rpg-item-header" });
		const iconEl = header.createEl("div", { cls: "life-rpg-item-icon" });
		if (item.icon.startsWith("assets/")) {
			iconEl.style.backgroundImage = `url('${this.stateManager.getAssetPath(item.icon)}')`;
			iconEl.addClass("has-custom-img");
		} else if (/^[a-z0-9-]+$/.test(item.icon)) {
			setIcon(iconEl, item.icon);
		} else {
			iconEl.setText(item.icon);
		}
		
		const nameGroup = header.createDiv({ cls: "life-rpg-item-name-group" });
		nameGroup.createEl("div", { text: item.name, cls: "life-rpg-item-name" });
		nameGroup.createEl("div", { text: `${item.rarity} ${item.slot}`, cls: "life-rpg-item-meta" });

		card.createEl("div", { text: item.description, cls: "life-rpg-item-desc" });

		// Modifiers list
		const mods = card.createDiv({ cls: "life-rpg-item-mods" });
		for (const [key, val] of Object.entries(item.modifiers)) {
			if (!val) continue;
			const sign = val > 0 ? "+" : "";
			let modLabel = key.toUpperCase();
			let suffix = "";
			if (key === "xpBonus") { modLabel = "XP"; suffix = "%"; }
			if (key === "gpBonus") { modLabel = "GP"; suffix = "%"; }
			if (key === "damageBonus") { modLabel = "DMG"; suffix = "%"; }
			if (key === "damageReduction") { modLabel = "DEF"; suffix = "%"; }
			
			const displayVal = suffix === "%" ? Math.round(val * 100) : val;
			mods.createEl("span", { text: `${modLabel} ${sign}${displayVal}${suffix}`, cls: "life-rpg-mod-badge" });
		}

		const actions = card.createDiv({ cls: "life-rpg-item-actions" });
		if (isEquipped) {
			actions.createEl("button", { text: "Equipped", cls: "life-rpg-btn-disabled", attr: { disabled: "true" } });
		} else {
			const equipBtn = actions.createEl("button", { text: "Equip", cls: "life-rpg-btn-primary life-rpg-btn-small" });
			equipBtn.addEventListener("click", () => {
				this.stateManager.equipItem(item.id, item.slot);
			});
		}

		const trashBtn = actions.createEl("button", { text: "🗑️", cls: "life-rpg-btn-icon life-rpg-btn-danger-subtle" });
		trashBtn.addEventListener("click", () => {
			if (confirm(`Destroy ${item.name}? This cannot be undone.`)) {
				this.stateManager.removeItem(item.id);
			}
		});
	}

	// ─── Shared Helpers ────────────────────────────────────────────────

	private renderBonusSummary(parent: HTMLElement, character: CharacterState, modifiers: any): void {
		const section = parent.createDiv({ cls: "life-rpg-bonus-summary" });
		section.createEl("h3", { text: "⚡ Active Bonuses" });

		const grid = section.createDiv({ cls: "life-rpg-bonus-grid" });

		// Collect per-source breakdown
		const inventory = this.stateManager.getInventory();
		const equippedItems = Object.values(character.equippedItems)
			.map(id => inventory.find(i => i.id === id))
			.filter(Boolean) as any[];

		const unlockedNodeIds = this.stateManager.getUnlockedSkillNodes();

		const bonusTypes = [
			{ key: "xpMultiplier", label: "XP Bonus", format: (v: number) => `+${Math.round((v - 1)*100)}%`, base: 1, itemKey: "xpBonus", nodeKey: "xpMultiplier" },
			{ key: "gpMultiplier", label: "GP Bonus", format: (v: number) => `+${Math.round((v - 1)*100)}%`, base: 1, itemKey: "gpBonus", nodeKey: "gpMultiplier" },
			{ key: "damageBonus", label: "Boss DMG", format: (v: number) => `+${Math.round(v*100)}%`, base: 0, itemKey: "damageBonus", nodeKey: "damageBonus" },
			{ key: "damageReduction", label: "DMG Reduction", format: (v: number) => `+${Math.round(v*100)}%`, base: 0, itemKey: "damageReduction", nodeKey: "damageReduction" },
			{ key: "wisdomSave", label: "Wisdom Save", format: (v: number) => `+${Math.round(v*100)}%`, base: 0, itemKey: "wisdomSave", nodeKey: "wisdomSave" },
			{ key: "hpMax", label: "Bonus HP", format: (v: number) => `+${v}`, base: 0, itemKey: "hpMax", nodeKey: "hpMax" },
		];

		for (const bt of bonusTypes) {
			const totalVal = modifiers[bt.key] ?? bt.base;
			if (totalVal === bt.base) continue; // Skip if no bonus

			const row = grid.createDiv({ cls: "life-rpg-bonus-row" });
			const rowHeader = row.createDiv({ cls: "life-rpg-bonus-row-header" });
			rowHeader.createEl("span", { text: bt.label, cls: "life-rpg-bonus-label" });
			rowHeader.createEl("span", { text: bt.format(totalVal), cls: "life-rpg-bonus-total" });

			const sources = row.createDiv({ cls: "life-rpg-bonus-sources" });

			// Energy System sources (Burnout)
			if (bt.key === "xpMultiplier" && modifiers.isBurntOut) {
				sources.createEl("span", { text: "🔥 BURNOUT: -25%", cls: "life-rpg-bonus-source debuff" });
			}

			// Equipment sources
			for (const item of equippedItems) {
				const val = item.modifiers[bt.itemKey] || 0;
				if (val > 0) {
					sources.createEl("span", { text: `${item.name}: +${bt.key.includes("Multiplier") || bt.key.includes("Bonus") || bt.key.includes("Save") || bt.key.includes("Reduction") ? Math.round(val*100)+"%" : val}`, cls: "life-rpg-bonus-source" });
				}
			}

			// Skill tree sources
			for (const nodeId of unlockedNodeIds) {
				const node = SKILL_TREE_NODES.find(n => n.id === nodeId);
				if (!node) continue;
				const val = (node.modifiers as any)[bt.nodeKey] || 0;
				if (val > 0) {
					sources.createEl("span", { text: `🌳 ${node.name}: +${bt.key === "hpMax" ? val : Math.round(val*100)+"%"}`, cls: "life-rpg-bonus-source" });
				}
			}
		}
	}


	private renderResourceBar(parent: HTMLElement, label: string, val: number, max: number, type: "hp" | "xp"): void {
		const container = parent.createDiv({ cls: `life-rpg-big-bar-container life-rpg-bar-${type}` });
		const header = container.createDiv({ cls: "life-rpg-bar-header" });
		header.createEl("span", { text: label });
		header.createEl("span", { text: `${formatNumber(val)} / ${formatNumber(max)}` });

		const barOuter = container.createDiv({ cls: "life-rpg-bar-outer" });
		const fill = barOuter.createDiv({ cls: "life-rpg-bar-fill" });
		const pct = percentage(val, max);
		fill.style.width = `${pct}%`;
	}

	private renderAttributeCard(parent: HTMLElement, config: any, attr: AttributeState, mod: number): void {
		const card = parent.createDiv({ cls: "life-rpg-attr-card" });
		card.style.setProperty("--attr-color", config.color);

		const header = card.createDiv({ cls: "life-rpg-attr-card-header" });
		header.createEl("span", { text: config.icon });
		header.createEl("span", { text: config.name });

		const valGroup = card.createDiv({ cls: "life-rpg-attr-card-value" });
		valGroup.createEl("span", { text: `Lv.${attr.level}`, cls: "life-rpg-level" });
		if (mod > 0) valGroup.createEl("span", { text: ` (+${mod})`, cls: "life-rpg-mod" });

		const barOuter = card.createDiv({ cls: "life-rpg-mini-bar-outer" });
		const barFill = barOuter.createDiv({ cls: "life-rpg-mini-bar-fill" });
		barFill.style.width = `${percentage(attr.xp, attr.xpToNextLevel)}%`;
	}

	private drawRadarChart(canvas: HTMLCanvasElement, attributes: Record<string, AttributeState>): void {
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.width;
		const height = canvas.height;
		const centerX = width / 2;
		const centerY = height / 2;
		const labels = ["STR", "INT", "WIS", "CHA"];
		const keys = ["str", "int", "wis", "cha"];
		
		// Find max level for scaling (at least 10)
		const values = keys.map(k => attributes[k].level);
		const maxVal = Math.max(10, ...values) * 1.1; 
		const radius = Math.min(centerX, centerY) * 0.8;

		ctx.clearRect(0,0,width,height);

		// Set drawing styles
		ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
		ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
		ctx.font = "bold 12px Inter, sans-serif";
		ctx.textAlign = "center";

		// Draw concentric web
		const levels = 5;
		for (let i = 1; i <= levels; i++) {
			const r = (radius / levels) * i;
			ctx.beginPath();
			for (let j = 0; j < labels.length; j++) {
				const angle = (Math.PI * 2 * j) / labels.length - Math.PI / 2;
				const x = centerX + r * Math.cos(angle);
				const y = centerY + r * Math.sin(angle);
				if (j === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.closePath();
			ctx.stroke();
		}

		// Draw axes and labels
		for (let i = 0; i < labels.length; i++) {
			const angle = (Math.PI * 2 * i) / labels.length - Math.PI / 2;
			const x = centerX + radius * Math.cos(angle);
			const y = centerY + radius * Math.sin(angle);
			
			ctx.beginPath();
			ctx.moveTo(centerX, centerY);
			ctx.lineTo(x, y);
			ctx.stroke();

			const labelX = centerX + (radius + 20) * Math.cos(angle);
			const labelY = centerY + (radius + 20) * Math.sin(angle);
			ctx.fillText(labels[i], labelX, labelY + 5);
		}

		// Draw data polygon
		ctx.beginPath();
		ctx.strokeStyle = "#f0d486";
		ctx.fillStyle = "rgba(240, 212, 134, 0.25)";
		ctx.lineWidth = 3;

		for (let i = 0; i < keys.length; i++) {
			const val = attributes[keys[i]].level;
			const r = (val / maxVal) * radius;
			const angle = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
			const x = centerX + r * Math.cos(angle);
			const y = centerY + r * Math.sin(angle);
			
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
		ctx.fill();
		ctx.stroke();

		// Points of the polygon
		ctx.fillStyle = "#f0d486";
		for (let i = 0; i < keys.length; i++) {
			const val = attributes[keys[i]].level;
			const r = (val / maxVal) * radius;
			const angle = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
			const x = centerX + r * Math.cos(angle);
			const y = centerY + r * Math.sin(angle);
			
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	private checkAndSpawnDelta(current: number, key: string, icon: string): void {
		const prev = this.prevValues.get(key);
		if (prev !== undefined && prev !== current) {
			const delta = current - prev;
			const sign = delta > 0 ? "+" : "";
			const cls = delta > 0 ? "life-rpg-delta-positive" : "life-rpg-delta-negative";
			
			// Determine color based on key
			let typeCls = "life-rpg-delta-xp";
			if (key === "hp") typeCls = "life-rpg-delta-hp";
			if (key === "gp") typeCls = "life-rpg-delta-gp";

			const floating = document.body.createDiv({ cls: `life-rpg-floating-delta ${cls} ${typeCls}` });
			floating.setText(`${icon} ${sign}${delta}`);
			
			const x = 20 + Math.random() * 20;
			const y = 40 + Math.random() * 20;
			floating.style.right = `${x}%`;
			floating.style.top = `${y}%`;

			setTimeout(() => floating.remove(), 2000);
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
