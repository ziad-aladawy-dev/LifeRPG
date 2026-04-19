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
		const storeItems = (this.stateManager as any).getStoreItems() as Item[];
		const character = this.stateManager.getCharacter();

		// Combine store items and custom rewards for filtering
		const allAvailable: (Item | Reward)[] = [...storeItems, ...rewards];

		const filtered = allAvailable.filter(entry => {
			// Category Filter
			if (this.currentCategory !== "all") {
				const entryCat = (entry as any).slot || (entry as any).category;
				if (entryCat !== this.currentCategory) return false;
			}

			// Search Filter
			if (this.searchQuery && !entry.name.toLowerCase().includes(this.searchQuery)) return false;

			// Locked Filter
			if (this.hideLocked) {
				const cond = (entry as any).lockCondition;
				if (cond && this.isLocked(cond, character)) return false;
			}

			return true;
		});

		if (filtered.length === 0) {
			grid.createDiv({ cls: "life-rpg-empty-state", text: "No treasures match your search..." });
		} else {
			filtered.forEach(entry => {
				if ((entry as any).slot) {
					this.renderItemCard(grid, entry as Item, currentGp);
				} else {
					this.renderRewardCard(grid, entry as Reward, currentGp);
				}
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

	private renderItemCard(parent: HTMLElement, item: Item, currentGp: number): void {
		const character = this.stateManager.getCharacter();
		const unlockedNodes = this.stateManager.getUnlockedSkillNodes();
		
		// Check conditions
		let isLocked = false;
		let lockReason = "";

		if (item.lockCondition) {
			const cond = item.lockCondition;
			if (cond.type === ConditionType.Level && character.level < cond.value) {
				isLocked = true;
				lockReason = cond.description || `Requires Level ${cond.value}`;
			} else if (cond.type === ConditionType.BossesDefeated && (this.stateManager as any).state.totalBossesDefeated < cond.value) {
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

		const canAfford = currentGp >= item.value;
		const card = parent.createDiv({
			cls: `life-rpg-reward-card life-rpg-item-card rarity-${item.rarity.toLowerCase()} ${isLocked ? "is-locked" : ""} ${canAfford ? "" : "life-rpg-reward-unaffordable"}`,
		});

		if (isLocked) {
			const lockOverlay = card.createDiv({ cls: "life-rpg-lock-overlay" });
			setIcon(lockOverlay, "lock");
			lockOverlay.createDiv({ text: lockReason, cls: "life-rpg-lock-reason" });
		}

		const iconEl = card.createEl("div", { cls: "life-rpg-reward-icon" });
		if (item.icon.startsWith("assets/")) {
			iconEl.style.backgroundImage = `url('${this.stateManager.getAssetPath(item.icon)}')`;
			iconEl.addClass("has-custom-img");
		} else if (/^[a-z0-9-]+$/.test(item.icon)) {
			setIcon(iconEl, item.icon);
		} else {
			iconEl.setText(item.icon);
		}

		card.createEl("div", { text: item.name, cls: "life-rpg-reward-name" });
		
		const meta = card.createDiv({ cls: "life-rpg-reward-item-meta" });
		meta.createEl("span", { text: `${item.rarity} ${item.slot}`, cls: `rarity-text-${item.rarity.toLowerCase()}` });

		const mods = card.createDiv({ cls: "life-rpg-reward-item-mods" });
		for (const [key, val] of Object.entries(item.modifiers)) {
			if (!val) continue;
			const sign = val > 0 ? "+" : "";
			mods.createEl("span", { text: `${key.toUpperCase()} ${sign}${val}` });
		}

		card.createEl("div", { text: `💰 ${formatNumber(item.value)} GP`, cls: "life-rpg-reward-cost" });

		const actions = card.createDiv({ cls: "life-rpg-reward-actions" });
		const buyBtn = actions.createEl("button", {
			text: isLocked ? "Locked" : (canAfford ? "🛒 Buy" : "🚫 N/A"),
			cls: `life-rpg-btn ${!isLocked && canAfford ? "life-rpg-btn-gold" : "life-rpg-btn-disabled"}`,
		});

		if (!isLocked && canAfford) {
			buyBtn.onclick = () => {
				if (confirm(`Purchase ${item.name} for ${item.value} GP?`)) {
					this.stateManager.purchaseItem(item);
				}
			};
		} else {
			buyBtn.disabled = true;
		}
	}

	private renderRewardCard(
		parent: HTMLElement,
		reward: Reward,
		currentGp: number
	): void {
		const canAfford = currentGp >= reward.cost;
		const card = parent.createDiv({
			cls: `life-rpg-reward-card ${canAfford ? "" : "life-rpg-reward-unaffordable"}`,
		});

		// Icon
		const iconEl = card.createEl("div", {
			cls: "life-rpg-reward-icon",
		});
		if (/^[a-z0-9-]+$/.test(reward.icon)) {
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
			text: canAfford ? "🛒 Buy" : "🚫 Can't Afford",
			cls: `life-rpg-btn ${canAfford ? "life-rpg-btn-gold" : "life-rpg-btn-disabled"}`,
		});
		if (canAfford) {
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
		const children = Array.from(card.children);
		children.forEach(c => ((c as HTMLElement).style.display = "none"));

		const form = card.createDiv({ cls: "life-rpg-add-reward-form life-rpg-form" });

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

		const iconInput = row.createEl("input", {
			type: "text",
			value: reward.icon,
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.width = "120px";

		const costInput = row.createEl("input", {
			type: "number",
			value: reward.cost.toString(),
			placeholder: "Cost (GP)",
			cls: "life-rpg-input",
		});
		costInput.style.width = "100px";

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
			const cost = parseInt(costInput.value, 10);
			if (!name || isNaN(cost) || cost <= 0) return;

			this.stateManager.updateReward(reward.id, {
				name,
				description: descInput.value.trim(),
				cost,
				icon: iconInput.value.trim() || "gift",
			});
		});

		cancelBtn.addEventListener("click", () => {
			form.remove();
			children.forEach(c => ((c as HTMLElement).style.display = ""));
		});

		nameInput.focus();
	}

	private showAddRewardForm(): void {
		const el = this.containerEl;
		if (el.querySelector(".life-rpg-add-reward-form")) return;

		const form = el.createDiv({ cls: "life-rpg-add-reward-form life-rpg-form" });

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

		const iconInput = row.createEl("input", {
			type: "text",
			placeholder: "Icon (e.g., 'gamepad-2' or 🎮)",
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.width = "120px";
		iconInput.title = "Can be an emoji or a Lucide icon name like 'gamepad-2', 'coffee', 'tv'";

		const costInput = row.createEl("input", {
			type: "number",
			placeholder: "Cost (GP)",
			cls: "life-rpg-input",
		});
		costInput.style.width = "100px";

		const btnGroup = form.createDiv({ cls: "life-rpg-btn-group" });
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

			this.stateManager.addReward({
				id: generateId(),
				name,
				description: descInput.value.trim(),
				cost,
				icon: iconInput.value.trim() || "gift",
				purchaseCount: 0,
				category: RewardCategory.RealLife,
			});
			form.remove();
		});

		cancelBtn.addEventListener("click", () => form.remove());
		nameInput.focus();
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
