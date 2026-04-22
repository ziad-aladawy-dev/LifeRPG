import { App, Modal, Setting } from "obsidian";
import { type Habit, ItemSlot } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { getTodayStr, formatDate } from "../../utils/dateUtils";

export class HabitHistoryModal extends Modal {
	private habit: Habit;
	private stateManager: StateManager;

	constructor(app: App, habit: Habit, stateManager: StateManager) {
		super(app);
		this.habit = habit;
		this.stateManager = stateManager;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `📜 History: ${this.habit.icon} ${this.habit.name}` });
		contentEl.createEl("p", { 
			text: "Retroactively mark days as completed or missed. Stats will be adjusted automatically. Use Streak Seals to protect missed days.",
			cls: "life-rpg-modal-desc"
		});

		const historyContainer = contentEl.createDiv({ cls: "life-rpg-history-list" });
		
		const today = new Date();
		const inventory = this.stateManager.getInventory();
		const streakSeal = inventory.find(i => i.consumableEffect?.type === "streak_freeze");

		for (let i = 0; i < 14; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateStr = formatDate(date);
			const isToday = i === 0;

			const historyVal = this.habit.history?.[dateStr];
			const isCompleted = historyVal === true;
			const isFrozen = historyVal === "freeze";

			const setting = new Setting(historyContainer)
				.setName(`${isToday ? "⭐️ Today" : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`)
				.setDesc(isFrozen ? `❄️ Frozen (Streak Preserved)` : dateStr);
			
			if (isFrozen) {
				setting.setDesc(`❄️ Frozen - ${dateStr}`);
				setting.addButton(btn => {
					btn.setButtonText("Unfreeze")
					   .onClick(async () => {
							await this.stateManager.setHabitHistory(this.habit.id, dateStr, false);
							this.refreshModal();
					   });
				});
			} else {
				setting.addToggle(toggle => {
					toggle.setValue(isCompleted)
						.onChange(async (value) => {
							await this.stateManager.setHabitHistory(this.habit.id, dateStr, value);
							this.refreshModal();
						});
				});

				// Add Freeze button if missed and seal owned
				if (!isCompleted && streakSeal) {
					setting.addButton(btn => {
						btn.setButtonText("❄️ Freeze")
						   .setTooltip("Use a Streak Seal to protect your streak")
						   .onClick(async () => {
								if (this.stateManager.applyStreakFreeze(this.habit.id, dateStr, streakSeal!.id)) {
									this.refreshModal();
								}
						   });
					});
				}
			}
		}

		contentEl.createDiv({ cls: "life-rpg-modal-footer" }).createEl("button", {
			text: "Close",
			cls: "life-rpg-btn life-rpg-btn-primary",
		}).onclick = () => this.close();
	}

	private refreshModal(): void {
		const updatedHabit = this.stateManager.getHabits().find(h => h.id === this.habit.id);
		if (updatedHabit) {
			this.habit = updatedHabit;
			this.onOpen();
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
