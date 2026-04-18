// ============================================================================
// Life RPG — Rewards Panel
// Displays the reward store where users spend GP on custom rewards.
// ============================================================================

import { setIcon } from "obsidian";
import { type Reward } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { processGpSpend } from "../../engine/GameEngine";
import { generateId } from "../../constants";
import { formatNumber } from "../../utils/formatter";
import { EventType } from "../../types";

export class RewardsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-rewards-panel" });
		this.stateManager = stateManager;
	}

	render(rewards: Reward[], currentGp: number): void {
		const el = this.containerEl;
		el.empty();

		// Header with GP balance and Add button
		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "🏪 Rewards Store" });
		const gpBadge = header.createEl("span", {
			text: `💰 ${formatNumber(currentGp)} GP`,
			cls: "life-rpg-gp-badge",
		});

		const addBtn = header.createEl("button", {
			text: "+ Add Reward",
			cls: "life-rpg-btn life-rpg-btn-small",
		});
		addBtn.addEventListener("click", () => this.showAddRewardForm());

		if (rewards.length === 0) {
			el.createDiv({
				cls: "life-rpg-empty-state",
				text: "No rewards created yet. Add rewards to motivate yourself — spend your hard-earned gold!",
			});
			return;
		}

		// Rewards grid
		const grid = el.createDiv({ cls: "life-rpg-rewards-grid" });
		for (const reward of rewards) {
			this.renderRewardCard(grid, reward, currentGp);
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
