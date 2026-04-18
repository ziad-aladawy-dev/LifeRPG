// ============================================================================
// Life RPG — Habits Panel
// Renders good and bad habits with log buttons and streak tracking.
// ============================================================================

import { setIcon } from "obsidian";
import { type Habit, type Skill, Difficulty } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { logGoodHabit, logBadHabit, resolveOutstandingHabit, undoHabit } from "../../engine/HabitManager";
import { calculateHabitReward, streakBonusMultiplier } from "../../engine/GameEngine";
import { generateId } from "../../constants";

export class HabitsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-habits-panel" });
		this.stateManager = stateManager;
	}

	render(habits: Habit[], skills: Skill[]): void {
		const el = this.containerEl;
		el.empty();

		// Header with Add button
		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "🔄 Habits" });
		const addBtn = header.createEl("button", {
			text: "+ Add Habit",
			cls: "life-rpg-btn life-rpg-btn-small",
		});
		addBtn.addEventListener("click", () => this.showAddHabitForm(skills));

		if (habits.length === 0) {
			el.createDiv({
				cls: "life-rpg-empty-state",
				text: "No habits defined yet. Create good habits to earn XP, or track bad habits to stay accountable!",
			});
			return;
		}

		// Good habits section
		const goodHabits = habits.filter((h: Habit) => h.type === "good");
		if (goodHabits.length > 0) {
			el.createEl("h4", { text: "✅ Good Habits", cls: "life-rpg-section-title life-rpg-section-good" });
			const goodList = el.createDiv({ cls: "life-rpg-habits-list" });
			for (const habit of goodHabits) {
				const completedToday = habit.lastCompleted !== null && 
					new Date(habit.lastCompleted).toDateString() === new Date().toDateString();
				this.renderHabitCard(goodList, habit, completedToday);
			}
		}

		// Bad habits section
		const badHabits = habits.filter((h: Habit) => h.type === "bad");
		if (badHabits.length > 0) {
			el.createEl("h4", { text: "⛔ Bad Habits", cls: "life-rpg-section-title life-rpg-section-bad" });
			const badList = el.createDiv({ cls: "life-rpg-habits-list" });
			for (const habit of badHabits) {
				const completedToday = habit.lastCompleted !== null && 
					new Date(habit.lastCompleted).toDateString() === new Date().toDateString();
				this.renderHabitCard(badList, habit, completedToday);
			}
		}
	}

	private renderHabitCard(
		parent: HTMLElement,
		habit: Habit,
		completedToday: boolean
	): void {
		const card = parent.createDiv({
			cls: `life-rpg-habit-card ${habit.type === "good" ? "life-rpg-habit-good" : "life-rpg-habit-bad"} ${completedToday ? "life-rpg-habit-done" : ""}`,
		});

		const cardContent = card.createDiv({ cls: "life-rpg-habit-content" });

		// Icon + Name
		const nameRow = cardContent.createDiv({ cls: "life-rpg-habit-name-row" });
		const iconEl = nameRow.createEl("span", {
			cls: "life-rpg-habit-icon",
		});
		// Check if it's an obsidian icon (doesn't contain emoji/special char)
		if (/^[a-z0-9-]+$/.test(habit.icon)) {
			setIcon(iconEl, habit.icon);
		} else {
			iconEl.setText(habit.icon);
		}

		nameRow.createEl("span", {
			text: habit.name,
			cls: "life-rpg-habit-name",
		});

		// Streak & info
		const infoRow = cardContent.createDiv({ cls: "life-rpg-habit-info" });
		
		if (habit.recurrenceDays && habit.recurrenceDays > 1) {
			infoRow.createEl("span", {
				text: `⏳ Every ${habit.recurrenceDays}d`,
				cls: "life-rpg-habit-streak",
			});
		}

		const settings = this.stateManager.getSettings();
		const baseReward = calculateHabitReward(habit.type, habit.difficulty, settings);
		
		if (habit.type === "good") {
			if (habit.streak > 0) {
				infoRow.createEl("span", {
				text: `🔥 ${habit.streak} streak`,
					cls: "life-rpg-habit-streak",
				});
			}
			
			const bonus = streakBonusMultiplier(habit.streak);
			const xpGain = Math.round(baseReward.xp * bonus);
			const gpGain = Math.round(baseReward.gp * bonus);
			
			infoRow.createEl("span", {
				text: `+${xpGain} XP, +${gpGain} GP`,
				cls: "life-rpg-habit-reward",
			});
		} else {
			infoRow.createEl("span", {
				text: `-${baseReward.hpDamage} HP`,
				cls: "life-rpg-habit-penalty",
			});
		}

		// Add last completed date if available
		const dateContainer = infoRow.createEl("span", {
			cls: "life-rpg-habit-date",
		});
		if (habit.lastCompleted) {
			const completedToday = new Date(habit.lastCompleted).toDateString() === new Date().toDateString();
			const dateStr = completedToday ? "Today" : new Date(habit.lastCompleted).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
			dateContainer.setText(`🗓️ ${dateStr}`);
		} else {
			dateContainer.setText(`🗓️ Never`);
		}

		// Action buttons
		const actions = card.createDiv({ cls: "life-rpg-habit-actions" });

		if ((habit.outstandingDays || 0) > 0) {
			// Outstanding Backlog State
			const outstandingContainer = actions.createDiv({ cls: "life-rpg-outstanding-actions" });
			outstandingContainer.createEl("span", { 
				text: `🚨 ${habit.outstandingDays} Owed: `, 
				cls: "life-rpg-alert-text" 
			});

			const catchUpBtn = outstandingContainer.createEl("button", {
				text: "✓ Done",
				cls: "life-rpg-btn life-rpg-btn-success life-rpg-btn-small",
			});
			catchUpBtn.addEventListener("click", () => this.logOutstandingHabit(habit, true));

			const missedBtn = outstandingContainer.createEl("button", {
				text: "✕ Missed",
				cls: "life-rpg-btn life-rpg-btn-danger life-rpg-btn-small",
			});
			missedBtn.addEventListener("click", () => this.logOutstandingHabit(habit, false));
			
		} else {
			// Standard Logic State
			// Good habits disabled if done today. Bad habits are restricted to once per day.
			const isDisabled = completedToday;
			
			const logBtn = actions.createEl("button", {
				cls: `life-rpg-btn ${habit.type === "good" ? "life-rpg-btn-success" : "life-rpg-btn-danger"}`,
				text: habit.type === "good" ? (completedToday ? "✓ Done" : "+") : (completedToday ? "✓ Logged" : "−"),
			});
			
			if (isDisabled) {
				logBtn.setAttribute("disabled", "true");
				logBtn.classList.add("life-rpg-btn-disabled");

				// Add Undo button
				const undoBtn = actions.createEl("button", {
					cls: "life-rpg-btn-icon life-rpg-habit-undo",
					text: "↩️",
				});
				undoBtn.title = "Undo logic";
				undoBtn.addEventListener("click", () => this.logHabitUndo(habit));
			} else {
				logBtn.addEventListener("click", () => this.logHabit(habit));
			}
		}

		// Delete button
		const deleteBtn = actions.createEl("button", {
			text: "✕",
			cls: "life-rpg-btn-icon life-rpg-btn-danger-subtle",
		});
		deleteBtn.addEventListener("click", () => {
			if (confirm(`Remove habit "${habit.name}"?`)) {
				this.stateManager.removeHabit(habit.id);
			}
		});
	}

	private logOutstandingHabit(habit: Habit, wasCompleted: boolean): void {
		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();
		const settings = this.stateManager.getSettings();

		const result = resolveOutstandingHabit(habit, character, skills, settings, wasCompleted);

		this.stateManager.setCharacter(result.character);
		this.stateManager.updateHabit(habit.id, result.habit);
		for (const skill of result.skills) {
			this.stateManager.updateSkill(skill.id, skill);
		}
		for (const entry of result.logEntries) {
			this.stateManager.addLogEntry(entry);
		}
		
		if (wasCompleted) {
			this.stateManager.incrementHabitsCompleted();
		}
	}

	private logHabitUndo(habit: Habit): void {
		const label = habit.type === "good" ? "reverse rewards and reduce streak" : "heal damage and revert penalty";
		if (
			!confirm(
				`Do you want to undo "${habit.name}"?\nThis will ${label}.`
			)
		) {
			return;
		}

		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();
		const settings = this.stateManager.getSettings();

		const result = undoHabit(habit, character, skills, settings);

		this.stateManager.setCharacter(result.character);
		this.stateManager.updateHabit(habit.id, result.habit);
		for (const skill of result.skills) {
			this.stateManager.updateSkill(skill.id, skill);
		}
		for (const entry of result.logEntries) {
			this.stateManager.addLogEntry(entry);
		}
	}
	private logHabit(habit: Habit): void {
		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();
		const settings = this.stateManager.getSettings();

		if (habit.type === "good") {
			const result = logGoodHabit(habit, character, skills, settings);
			this.stateManager.setCharacter(result.character);
			this.stateManager.updateHabit(habit.id, result.habit);
			for (const skill of result.skills) {
				this.stateManager.updateSkill(skill.id, skill);
			}
			for (const entry of result.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
			this.stateManager.incrementHabitsCompleted();
		} else {
			const result = logBadHabit(habit, character, settings);
			this.stateManager.setCharacter(result.character);
			this.stateManager.updateHabit(habit.id, result.habit);
			for (const entry of result.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
		}
	}

	private showAddHabitForm(skills: Skill[]): void {
		const el = this.containerEl;
		if (el.querySelector(".life-rpg-add-habit-form")) return;

		const form = el.createDiv({ cls: "life-rpg-add-habit-form life-rpg-form" });

		// Name
		const nameInput = form.createEl("input", {
			type: "text",
			placeholder: "Habit name (e.g., Morning Meditation)",
			cls: "life-rpg-input",
		});

		// Icon
		const iconInput = form.createEl("input", {
			type: "text",
			placeholder: "Icon (e.g., 'check' or 🧘)",
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.style.width = "120px";
		iconInput.title = "Can be an emoji or a Lucide icon name like 'check', 'x', 'heart'";

		// Type
		const typeRow = form.createDiv({ cls: "life-rpg-form-row" });
		typeRow.createEl("label", { text: "Type:" });
		const typeSelect = typeRow.createEl("select", { cls: "life-rpg-select" });
		typeSelect.createEl("option", { value: "good", text: "✅ Good Habit (+XP/GP)" });
		typeSelect.createEl("option", { value: "bad", text: "⛔ Bad Habit (-HP)" });

		// Difficulty
		const diffRow = form.createDiv({ cls: "life-rpg-form-row" });
		diffRow.createEl("label", { text: "Difficulty:" });
		const diffSelect = diffRow.createEl("select", { cls: "life-rpg-select" });
		diffSelect.createEl("option", { value: "1", text: "⭐ Easy" });
		diffSelect.createEl("option", { value: "2", text: "⭐⭐ Medium" });
		diffSelect.createEl("option", { value: "3", text: "⭐⭐⭐ Hard" });

		// Recurrence
		const recurRow = form.createDiv({ cls: "life-rpg-form-row" });
		recurRow.createEl("label", { text: "Repeats:" });
		const recurInput = recurRow.createEl("input", {
			type: "number",
			cls: "life-rpg-input life-rpg-input-small",
			value: "1",
			attr: { min: "1" },
		});
		recurInput.style.width = "50px";
		recurRow.createEl("span", { text: "days", cls: "life-rpg-form-suffix" });

		// Buttons
		const btnGroup = form.createDiv({ cls: "life-rpg-btn-group" });
		const saveBtn = btnGroup.createEl("button", {
			text: "Create Habit",
			cls: "life-rpg-btn life-rpg-btn-primary",
		});
		const cancelBtn = btnGroup.createEl("button", {
			text: "Cancel",
			cls: "life-rpg-btn",
		});

		saveBtn.addEventListener("click", () => {
			const name = nameInput.value.trim();
			const recurDays = parseInt(recurInput.value, 10);
			if (!name || isNaN(recurDays) || recurDays < 1) return;

			const habit: Habit = {
				id: generateId(),
				name,
				icon: iconInput.value.trim() || (typeSelect.value === "good" ? "check" : "x"),
				type: typeSelect.value as "good" | "bad",
				difficulty: parseInt(diffSelect.value, 10) as Difficulty,
				skillId: null,
				streak: 0,
				lastCompleted: null,
				xpReward: 0,
				gpReward: 0,
				hpPenalty: 0,
				outstandingDays: 0,
				lastEvaluatedDate: new Date().toISOString().split("T")[0],
				recurrenceDays: recurDays,
			};

			this.stateManager.addHabit(habit);
			form.remove();
		});

		cancelBtn.addEventListener("click", () => form.remove());
		nameInput.focus();
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
