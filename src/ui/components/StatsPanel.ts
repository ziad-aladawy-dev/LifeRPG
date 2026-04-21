// ============================================================================
// Life RPG — Stats Panel
// Renders the character's HP bar, XP bar, GP balance, and level.
// ============================================================================

import { setIcon } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { type CharacterState, type AttributeState } from "../../types";
import { formatNumber, percentage } from "../../utils/formatter";
import { getCharacterRank } from "../../engine/ClassSystem";
import { SKILL_TREE_NODES } from "../../constants";

export class StatsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;
	private prevValues: Map<string, number> = new Map();

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-stats-panel" });
		this.stateManager = stateManager;
	}

	render(character: CharacterState): void {
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
			attr: { width: "320", height: "300" } 
		});
		this.drawRadarChart(canvas, character.attributes as unknown as Record<string, AttributeState>);

		// --- PROFILE SECTION ---
		const profileSection = el.createDiv({ cls: "life-rpg-stats-profile" });
		
		const avatarContainer = profileSection.createDiv({ cls: "life-rpg-stats-avatar" });
		if (character.avatarUrl && (character.avatarUrl.startsWith("http") || character.avatarUrl.startsWith("data:image/"))) {
			avatarContainer.createEl("img", { attr: { src: character.avatarUrl }, cls: "life-rpg-avatar-img" });
		} else {
			avatarContainer.setText(character.avatarUrl || "⚔️");
		}

		const nameContainer = profileSection.createDiv({ cls: "life-rpg-stats-name-group" });
		nameContainer.createEl("h2", { text: character.name, cls: "life-rpg-stats-name" });
		const rankTitle = getCharacterRank(character.level, character.classId);
		nameContainer.createEl("span", { text: `${rankTitle} • Level ${character.level}`, cls: "life-rpg-stats-rank" });

		// --- RESOURCE BARS SECTION ---
		const resourceSection = el.createDiv({ cls: "life-rpg-resource-section" });
		
		this.renderResourceBar(resourceSection, "Health", character.hp, character.maxHp, "hp");
		this.renderResourceBar(resourceSection, "Experience", character.xp, character.xpToNextLevel, "xp");

		// --- ATTRIBUTES GRID ---
		const attrsGrid = el.createDiv({ cls: "life-rpg-attrs-grid" });
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

		// --- FLOATING GOLD ---
		const goldPocket = el.createDiv({ cls: "life-rpg-gold-pocket" });
		setIcon(goldPocket.createEl("span"), "coins");
		goldPocket.createEl("span", { text: `${formatNumber(character.gp)} GP` });

		// --- ACTIVE BONUS SUMMARY ---
		this.renderBonusSummary(el, character, modifiers);
	}

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
		const allNodes = (this.stateManager as any).constructor ? SKILL_TREE_NODES : [];

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
			const header = row.createDiv({ cls: "life-rpg-bonus-row-header" });
			header.createEl("span", { text: bt.label, cls: "life-rpg-bonus-label" });
			header.createEl("span", { text: bt.format(totalVal), cls: "life-rpg-bonus-total" });

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

	private createAttributeCard(parent: HTMLElement, name: string, shortName: string, icon: string, attr: AttributeState): void {
		const card = parent.createDiv({ cls: "life-rpg-attribute-card" });
		
		const header = card.createDiv({ cls: "life-rpg-attr-header" });
		const title = header.createDiv({ cls: "life-rpg-attr-title" });
		const iconEl = title.createEl("span", { cls: "life-rpg-attr-icon" });
		iconEl.setText(icon);
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
		iconEl.setText(icon);
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
		nameInput.addEventListener("keydown", (e) => e.stopPropagation());

		const avatarRow = form.createDiv({ cls: "life-rpg-form-row" });
		avatarRow.createEl("label", { text: "Avatar (Emoji or URL):" });
		const avatarInput = avatarRow.createEl("input", {
			type: "text",
			value: character.avatarUrl,
			placeholder: "⚔️",
			cls: "life-rpg-input",
		});
		avatarInput.addEventListener("keydown", (e) => e.stopPropagation());

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
			
			// Position near the stats panel? Better to just show at top right or center
			// But for "juice", let's spawn at a random position near the center?
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
