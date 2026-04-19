import { App, Modal, Setting } from "obsidian";
import { type Habit } from "../../types";
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
			text: "Retroactively mark days as completed or missed. Stats will be adjusted automatically.",
			cls: "life-rpg-modal-desc"
		});

		const historyContainer = contentEl.createDiv({ cls: "life-rpg-history-list" });
		
		// Generate last 14 days
		const today = new Date();
		for (let i = 0; i < 14; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateStr = formatDate(date);
			const isToday = i === 0;

			const isCompleted = this.habit.history?.[dateStr] ?? false;

			new Setting(historyContainer)
				.setName(`${isToday ? "⭐️ Today" : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`)
				.setDesc(dateStr)
				.addToggle(toggle => {
					toggle.setValue(isCompleted)
						.onChange(async (value) => {
							await this.stateManager.setHabitHistory(this.habit.id, dateStr, value);
							// Refresh modal view to update other days if streaks changed
							const updatedHabit = this.stateManager.getHabits().find(h => h.id === this.habit.id);
							if (updatedHabit) {
								this.habit = updatedHabit;
								this.onOpen();
							}
						});
				});
		}

		contentEl.createDiv({ cls: "life-rpg-modal-footer" }).createEl("button", {
			text: "Close",
			cls: "life-rpg-btn life-rpg-btn-primary",
		}).onclick = () => this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
