// ============================================================================
// Life RPG — Inventory Panel
// Displays owned items and allows equipping/unequipping to slots.
// ============================================================================

import { setIcon } from "obsidian";
import { type Item, ItemSlot, ItemRarity } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { renderIcon } from "../../utils/uiUtils";

export class InventoryPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-inventory-panel" });
		this.stateManager = stateManager;
	}

	render(): void {
		const el = this.containerEl;
		el.empty();

		const inventory = this.stateManager.getInventory();
		const char = this.stateManager.getCharacter();

		// Header
		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "🎒 Inventory" });

		// Equipped Section
		const equippedSection = el.createDiv({ cls: "life-rpg-equipped-section" });
		equippedSection.createEl("h4", { text: "🛡️ Equipped Gear", cls: "life-rpg-section-title" });
		const equippedGrid = equippedSection.createDiv({ cls: "life-rpg-equipped-grid" });

		const slots = [ItemSlot.Weapon, ItemSlot.Armor, ItemSlot.Accessory];
		for (const slot of slots) {
			const itemId = char.equippedItems[slot];
			const item = itemId ? (inventory.find(i => i.id === itemId) || null) : null;
			this.renderEquippedSlot(equippedGrid, slot, item);
		}

		// Items List
		const itemsSection = el.createDiv({ cls: "life-rpg-items-section" });
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
			} else {
				renderIcon(iconEl, item.icon);
			}
			itemInfo.createEl("span", { text: item.name, cls: "life-rpg-slot-item-name" });
			
			const unequipBtn = slotEl.createEl("button", {
				text: "Unequip",
				cls: "life-rpg-btn-subtle life-rpg-btn-xs",
			});
			unequipBtn.addEventListener("click", () => {
				this.stateManager.unequipItem(slot);
				this.render();
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
		} else {
			renderIcon(iconEl, item.icon);
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
			let label = key.toUpperCase();
			let suffix = "";
			if (key === "xpBonus") { label = "XP"; suffix = "%"; }
			if (key === "gpBonus") { label = "GP"; suffix = "%"; }
			if (key === "damageBonus") { label = "DMG"; suffix = "%"; }
			if (key === "damageReduction") { label = "DEF"; suffix = "%"; }
			
			const displayVal = suffix === "%" ? Math.round(val * 100) : val;
			mods.createEl("span", { text: `${label} ${sign}${displayVal}${suffix}`, cls: "life-rpg-mod-badge" });
		}

		const actions = card.createDiv({ cls: "life-rpg-item-actions" });
		if (isEquipped) {
			const btn = actions.createEl("button", { text: "Equipped", cls: "life-rpg-btn-disabled", attr: { disabled: true } });
		} else {
			const equipBtn = actions.createEl("button", { text: "Equip", cls: "life-rpg-btn-primary life-rpg-btn-small" });
			equipBtn.addEventListener("click", () => {
				this.stateManager.equipItem(item.id, item.slot);
				this.render();
			});
		}

		const trashBtn = actions.createEl("button", { text: "🗑️", cls: "life-rpg-btn-icon life-rpg-btn-danger-subtle" });
		trashBtn.addEventListener("click", () => {
			if (confirm(`Destroy ${item.name}? This cannot be undone.`)) {
				this.stateManager.removeItem(item.id);
				this.render();
			}
		});
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
