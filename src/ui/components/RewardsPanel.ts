// ============================================================================
// Life RPG — Rewards Panel
// Displays the reward store where users spend GP on custom rewards.
// ============================================================================

import { setIcon } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { processGpSpend } from "../../engine/GameEngine";
import { generateId } from "../../constants";
import { formatNumber } from "../../utils/formatter";
import { type Reward, type Item, ConditionType, type CharacterAttributes, RewardCategory, EventType, type CharacterState } from "../../types";

export class RewardsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-rewards-panel" });
		this.stateManager = stateManager;
	}

	private currentCategory: string = "all";
	private hideLocked: boolean = false;
	private searchQuery: string = "";

	render(rewards: Reward[], currentGp: number): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("life-rpg-rewards-page");

		// --- Header Section ---
		const header = el.createDiv({ cls: "life-rpg-store-header" });
		const titleGroup = header.createDiv({ cls: "title-group" });
		titleGroup.createEl("h2", { text: "💎 The Grand Bazaar" });
		titleGroup.createEl("span", { text: "Spend your hard-earned gold on artifacts and mortal pleasures.", cls: "subtitle" });

		const gpDisplay = header.createDiv({ cls: "life-rpg-gp-display-large" });
		setIcon(gpDisplay.createDiv({ cls: "gp-icon" }), "coins");
		gpDisplay.createEl("span", { text: formatNumber(currentGp), cls: "gp-value" });
		gpDisplay.createEl("span", { text: "GOLD", cls: "gp-label" });

		// --- Controls Section (Search, Tabs, Toggles) ---
		const controls = el.createDiv({ cls: "life-rpg-store-controls" });
		
		// Search Bar
		const searchWrapper = controls.createDiv({ cls: "search-wrapper" });
		const searchInput = searchWrapper.createEl("input", {
			type: "text",
			placeholder: "Search items...",
			cls: "life-rpg-store-search",
			value: this.searchQuery
		});
		searchInput.oninput = () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.render(rewards, currentGp);
		};

		// Toggles
		const toggleGroup = controls.createDiv({ cls: "toggle-group" });
		const hideLockedLabel = toggleGroup.createEl("label", { cls: "life-rpg-toggle-label" });
		const hideLockedCheck = hideLockedLabel.createEl("input", { type: "checkbox" });
		hideLockedCheck.checked = this.hideLocked;
		hideLockedLabel.createEl("span", { text: "Hide Locked" });
		hideLockedCheck.onchange = () => {
			this.hideLocked = hideLockedCheck.checked;
			this.render(rewards, currentGp);
		};

		const addBtn = toggleGroup.createEl("button", { text: "+ Custom Reward", cls: "life-rpg-btn-subtle" });
		addBtn.onclick = () => this.showAddRewardForm();

		// Category Tabs
		const tabsWrapper = el.createDiv({ cls: "life-rpg-store-tabs-wrapper" });
		const categories = [
			{ id: "all", label: "All Items", icon: "layout-grid" },
			{ id: "weapon", label: "Weapons", icon: "sword" },
			{ id: "armor", label: "Armor", icon: "shirt" },
			{ id: "accessory", label: "Trinkets", icon: "gem" },
			{ id: "real", label: "Mortal", icon: "heart" }
		];

		categories.forEach(cat => {
			const tab = tabsWrapper.createDiv({ 
				cls: `life-rpg-store-tab ${this.currentCategory === cat.id ? "is-active" : ""}` 
			});
			setIcon(tab.createDiv({ cls: "tab-icon" }), cat.icon);
			tab.createEl("span", { text: cat.label });
			tab.onclick = () => {
				this.currentCategory = cat.id;
				this.render(rewards, currentGp);
			};
		});

		// --- Grid Section ---
		const grid = el.createDiv({ cls: "life-rpg-rewards-grid" });

		// Filter logic
		const inventoryNames = new Set(this.stateManager.getInventory().map(i => i.name));
		const character = this.stateManager.getCharacter();

		const filtered = rewards.filter(entry => {
			// Skip single-purchase unique base items if already owned
			if (entry.category === RewardCategory.Item && entry.item) {
				if (inventoryNames.has(entry.item.name)) return false;
			}

			// Category Filter
			const entryCat = entry.category === RewardCategory.Item && entry.item ? entry.item.slot : "real";
			if (this.currentCategory !== "all" && entryCat !== this.currentCategory) return false;

			// Search Filter
			if (this.searchQuery && !entry.name.toLowerCase().includes(this.searchQuery)) return false;

			// Locked Filter
			if (this.hideLocked) {
				const cond = entry.item ? entry.item.lockCondition : undefined;
				if (cond && this.isLocked(cond, character)) return false;
			}

			return true;
		});

		if (filtered.length === 0) {
			grid.createDiv({ cls: "life-rpg-empty-state", text: "No treasures match your search..." });
		} else {
			filtered.forEach(entry => {
				this.renderRewardCard(grid, entry, currentGp, character);
			});
		}
	}

	private isLocked(cond: any, character: any): boolean {
		if (cond.type === ConditionType.Level && character.level < cond.value) return true;
		if (cond.type === ConditionType.BossesDefeated && (this.stateManager as any).getState().totalBossesDefeated < cond.value) return true;
		if (cond.type === ConditionType.TasksCompleted && (this.stateManager as any).getState().totalTasksCompleted < cond.value) return true;
		if (cond.type === ConditionType.AttrStr && character.attributes?.str?.level < cond.value) return true;
		if (cond.type === ConditionType.AttrInt && character.attributes?.int?.level < cond.value) return true;
		if (cond.type === ConditionType.AttrWis && character.attributes?.wis?.level < cond.value) return true;
		if (cond.type === ConditionType.AttrCha && character.attributes?.cha?.level < cond.value) return true;
		return false;
	}

	private renderRewardCard(
		parent: HTMLElement,
		reward: Reward,
		currentGp: number,
		character: CharacterState
	): void {
		// Calculate lock status
		let isLocked = false;
		let lockReason = "";
		if (reward.item && reward.item.lockCondition) {
			const cond = reward.item.lockCondition;
			if (cond.type === ConditionType.Level && character.level < cond.value) {
				isLocked = true;
				lockReason = cond.description || `Requires Level ${cond.value}`;
			} else if (cond.type === ConditionType.BossesDefeated && (this.stateManager as any).getState().totalBossesDefeated < cond.value) {
				isLocked = true;
				lockReason = cond.description || `Defeat ${cond.value} Bosses`;
			} else if (cond.type.startsWith("attr_")) {
				const attrKey = cond.type.replace("attr_", "") as keyof CharacterAttributes;
				const attr = character.attributes[attrKey];
				// Cast to any to check level safely if it exists
				if (attr && (attr as any).level < cond.value) {
					isLocked = true;
					lockReason = cond.description;
				}
			}
		}

		let rarityCls = reward.item ? `rarity-${reward.item.rarity.toLowerCase()}` : "";
		const canAfford = currentGp >= reward.cost;
		const card = parent.createDiv({
			cls: `life-rpg-reward-card ${rarityCls} ${canAfford ? "" : "life-rpg-reward-unaffordable"} ${isLocked ? "is-locked" : ""}`,
		});

		if (isLocked) {
			const lockOverlay = card.createDiv({ cls: "life-rpg-lock-overlay" });
			setIcon(lockOverlay, "lock");
			lockOverlay.createDiv({ text: lockReason, cls: "life-rpg-lock-reason" });
		}

		// Icon
		const iconEl = card.createEl("div", {
			cls: "life-rpg-reward-icon",
		});
		if (reward.icon.startsWith("http://") || reward.icon.startsWith("https://")) {
			iconEl.style.backgroundImage = `url('${reward.icon}')`;
			iconEl.addClass("has-custom-img");
		} else if (reward.icon.startsWith("assets/")) {
			iconEl.style.backgroundImage = `url('${this.stateManager.getAssetPath(reward.icon)}')`;
			iconEl.addClass("has-custom-img");
		} else if (/^[a-z0-9-]+$/.test(reward.icon)) {
			setIcon(iconEl, reward.icon);
		} else {
			iconEl.setText(reward.icon);
		}

		// Name
		card.createEl("div", {
			text: reward.name,
			cls: "life-rpg-reward-name",
		});

		// Item stats if applicable
		if (reward.item) {
			const item = reward.item;
			const meta = card.createDiv({ cls: "life-rpg-reward-item-meta" });
			meta.createEl("span", { text: `${item.rarity} ${item.slot}`, cls: `rarity-text-${item.rarity.toLowerCase()}` });
			
			const mods = card.createDiv({ cls: "life-rpg-reward-item-mods" });
			for (const [key, val] of Object.entries(item.modifiers)) {
				if (!val) continue;
				const sign = val > 0 ? "+" : "";
				mods.createEl("span", { text: `${key.toUpperCase()} ${sign}${val}` });
			}
		}

		// Description
		if (reward.description) {
			card.createEl("div", {
				text: reward.description,
				cls: "life-rpg-reward-desc",
			});
		}

		// Cost
		card.createEl("div", {
			text: `💰 ${formatNumber(reward.cost)} GP`,
			cls: "life-rpg-reward-cost",
		});

		// Purchase count
		if (reward.purchaseCount > 0) {
			card.createEl("div", {
				text: `Purchased ${reward.purchaseCount}x`,
				cls: "life-rpg-reward-purchased",
			});
		}

		// Action row
		const actions = card.createDiv({ cls: "life-rpg-reward-actions" });

		// Buy button
		const buyBtn = actions.createEl("button", {
			text: isLocked ? "Locked" : (canAfford ? "🛒 Buy" : "🚫 N/A"),
			cls: `life-rpg-btn ${!isLocked && canAfford ? "life-rpg-btn-gold" : "life-rpg-btn-disabled"}`,
		});
		if (!isLocked && canAfford) {
			buyBtn.addEventListener("click", () => this.purchaseReward(reward));
		} else {
			buyBtn.disabled = true;
		}

		// Edit button
		const editBtn = actions.createEl("button", {
			text: "✏️",
			cls: "life-rpg-btn-icon",
		});
		editBtn.addEventListener("click", () => {
			this.showEditRewardForm(reward, card);
		});

		// Delete button
		const deleteBtn = actions.createEl("button", {
			text: "✕",
			cls: "life-rpg-btn-icon life-rpg-btn-danger-subtle",
		});
		deleteBtn.addEventListener("click", () => {
			if (confirm(`Remove reward "${reward.name}"?`)) {
				this.stateManager.removeReward(reward.id);
			}
		});
	}

	private purchaseReward(reward: Reward): void {
		const character = this.stateManager.getCharacter();
		const updatedChar = processGpSpend(character, reward.cost);

		if (!updatedChar) return; // Shouldn't happen if button is properly disabled

		this.stateManager.setCharacter(updatedChar);
		this.stateManager.updateReward(reward.id, {
			purchaseCount: reward.purchaseCount + 1,
		});

		// If it's an item, add to inventory
		if (reward.item) {
			this.stateManager.addItem({ ...reward.item, id: generateId() });
		}

		this.stateManager.addLogEntry({
			id: generateId(),
			timestamp: new Date().toISOString(),
			type: EventType.RewardPurchase,
			message: `🛒 Purchased: "${reward.name}" for ${formatNumber(reward.cost)} GP`,
			xpDelta: 0,
			gpDelta: -reward.cost,
			hpDelta: 0,
		});
	}

	private showEditRewardForm(reward: Reward, card: HTMLElement): void {
		const overlay = document.body.createDiv({ cls: "life-rpg-modal-overlay" });
		overlay.style.position = "absolute";
		overlay.style.inset = "0";
		overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
		overlay.style.backdropFilter = "blur(6px)";
		overlay.style.display = "flex";
		overlay.style.alignItems = "center";
		overlay.style.justifyContent = "center";
		overlay.style.zIndex = "999";

		this.containerEl.style.position = "relative";
		this.containerEl.appendChild(overlay);

		const form = overlay.createDiv({ cls: "life-rpg-add-reward-form life-rpg-form" });
		form.style.background = "var(--stone-darker)";
		form.style.padding = "24px";
		form.style.borderRadius = "var(--radius-lg)";
		form.style.border = "1px solid var(--border-gold)";
		form.style.boxShadow = "var(--shadow-deep), 0 0 40px rgba(0,0,0,0.5)";
		form.style.width = "320px";
		form.style.display = "flex";
		form.style.flexDirection = "column";
		form.style.gap = "14px";

		form.createEl("h3", { text: "Edit Relic", cls: "life-rpg-modal-title" }).style.margin = "0 0 10px 0";

		const nameInput = form.createEl("input", {
			type: "text",
			value: reward.name,
			placeholder: "Reward name",
			cls: "life-rpg-input",
		});

		const descInput = form.createEl("input", {
			type: "text",
			value: reward.description || "",
			placeholder: "Description (optional)",
			cls: "life-rpg-input",
		});

		const row = form.createDiv({ cls: "life-rpg-form-row" });
		row.style.display = "flex";
		row.style.gap = "8px";

		const iconInput = row.createEl("input", {
			type: "text",
			value: reward.icon,
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.flex = "1";

		const costInput = row.createEl("input", {
			type: "number",
			value: reward.cost.toString(),
			placeholder: "Cost (GP)",
			cls: "life-rpg-input",
		});
		costInput.style.width = "80px";

		const catLabel = form.createEl("label", { text: "Category:", cls: "life-rpg-toggle-label" });
		catLabel.style.marginTop = "4px";
		const categorySelect = form.createEl("select", { cls: "life-rpg-input" });
		const currentCat = reward.item ? reward.item.slot : "real";
		categorySelect.createEl("option", { value: "real", text: "Mortal Pleasure" }).selected = currentCat === "real";
		categorySelect.createEl("option", { value: "weapon", text: "Weapon" }).selected = currentCat === "weapon";
		categorySelect.createEl("option", { value: "armor", text: "Armor" }).selected = currentCat === "armor";
		categorySelect.createEl("option", { value: "accessory", text: "Trinket" }).selected = currentCat === "accessory";

		const btnGroup = form.createDiv({ cls: "life-rpg-btn-group" });
		btnGroup.style.marginTop = "8px";
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
			const cost = parseInt(costInput.value, 10);
			if (!name || isNaN(cost) || cost <= 0) return;

			const selectedType = categorySelect.value;
			let newItemValue = reward.item;

			if (selectedType === "real") {
				newItemValue = undefined;
			} else {
				newItemValue = reward.item || {
					id: generateId(),
					name: name,
					description: descInput.value.trim(),
					icon: iconInput.value.trim() || 'sword',
					rarity: ItemRarity.Common,
					slot: selectedType as ItemSlot,
					value: cost,
					modifiers: {}
				};
				newItemValue.name = name;
				newItemValue.icon = iconInput.value.trim() || 'sword';
				newItemValue.slot = selectedType as ItemSlot;
				newItemValue.description = descInput.value.trim();
			}

			this.stateManager.updateReward(reward.id, {
				name,
				description: descInput.value.trim(),
				cost,
				icon: iconInput.value.trim() || "gift",
				item: newItemValue,
				category: selectedType === "real" ? RewardCategory.RealLife : RewardCategory.Item
			});
			overlay.remove();
		});

		cancelBtn.addEventListener("click", () => overlay.remove());
		nameInput.focus();
	}

	private showAddRewardForm(): void {
		const el = this.containerEl;
		if (el.querySelector(".life-rpg-modal-overlay")) return;

		const overlay = document.body.createDiv({ cls: "life-rpg-modal-overlay" });
		overlay.style.position = "absolute";
		overlay.style.inset = "0";
		overlay.style.backgroundColor = "rgba(0,0,0,0.7)";
		overlay.style.backdropFilter = "blur(6px)";
		overlay.style.display = "flex";
		overlay.style.alignItems = "center";
		overlay.style.justifyContent = "center";
		overlay.style.zIndex = "999";

		el.style.position = "relative";
		el.appendChild(overlay);

		const form = overlay.createDiv({ cls: "life-rpg-add-reward-form life-rpg-form" });
		form.style.background = "var(--stone-darker)";
		form.style.padding = "24px";
		form.style.borderRadius = "var(--radius-lg)";
		form.style.border = "1px solid var(--border-gold)";
		form.style.boxShadow = "var(--shadow-deep), 0 0 40px rgba(0,0,0,0.5)";
		form.style.width = "320px";
		form.style.display = "flex";
		form.style.flexDirection = "column";
		form.style.gap = "14px";

		form.createEl("h3", { text: "Forge Custom Reward", cls: "life-rpg-modal-title" }).style.margin = "0 0 10px 0";

		const nameInput = form.createEl("input", {
			type: "text",
			placeholder: "Reward name (e.g., 1 Hour Gaming)",
			cls: "life-rpg-input",
		});

		const descInput = form.createEl("input", {
			type: "text",
			placeholder: "Description (optional)",
			cls: "life-rpg-input",
		});

		const row = form.createDiv({ cls: "life-rpg-form-row" });
		row.style.display = "flex";
		row.style.gap = "8px";

		const iconInput = row.createEl("input", {
			type: "text",
			placeholder: "Icon ('gamepad-2' or 🎮)",
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.flex = "1";
		iconInput.title = "Can be an emoji or a Lucide icon";

		const costInput = row.createEl("input", {
			type: "number",
			placeholder: "Cost (GP)",
			cls: "life-rpg-input",
		});
		costInput.style.width = "80px";

		const catLabel = form.createEl("label", { text: "Category:", cls: "life-rpg-toggle-label" });
		catLabel.style.marginTop = "4px";
		const categorySelect = form.createEl("select", { cls: "life-rpg-input" });
		categorySelect.createEl("option", { value: "real", text: "Mortal Pleasure" });
		categorySelect.createEl("option", { value: "weapon", text: "Weapon" });
		categorySelect.createEl("option", { value: "armor", text: "Armor" });
		categorySelect.createEl("option", { value: "accessory", text: "Trinket" });

		const btnGroup = form.createDiv({ cls: "life-rpg-btn-group" });
		btnGroup.style.marginTop = "8px";
		const saveBtn = btnGroup.createEl("button", {
			text: "Create Reward",
			cls: "life-rpg-btn life-rpg-btn-primary",
		});
		const cancelBtn = btnGroup.createEl("button", {
			text: "Cancel",
			cls: "life-rpg-btn",
		});

		saveBtn.addEventListener("click", () => {
			const name = nameInput.value.trim();
			const cost = parseInt(costInput.value, 10);
			if (!name || isNaN(cost) || cost <= 0) return;

			const selectedType = categorySelect.value;
			const icon = iconInput.value.trim() || (selectedType === "real" ? "gift" : "sword");

			let newItem: Item | undefined = undefined;
			if (selectedType !== "real") {
				newItem = {
					id: generateId(),
					name: name,
					description: descInput.value.trim(),
					icon: icon,
					rarity: ItemRarity.Common,
					slot: selectedType as ItemSlot,
					value: cost,
					modifiers: {}
				};
			}

			this.stateManager.addReward({
				id: generateId(),
				name,
				description: descInput.value.trim(),
				cost,
				icon,
				purchaseCount: 0,
				category: selectedType === "real" ? RewardCategory.RealLife : RewardCategory.Item,
				item: newItem
			});
			overlay.remove();
		});

		cancelBtn.addEventListener("click", () => overlay.remove());
		nameInput.focus();
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
