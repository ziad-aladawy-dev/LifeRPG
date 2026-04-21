// ============================================================================
// Life RPG — Habit Detail Modal
// A unified place to view and edit habit data with a premium high-fantasy theme.
// ============================================================================

import { Modal, App, Setting, setIcon } from "obsidian";
import { type Habit, Difficulty, type Skill } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { formatNumber } from "../../utils/formatter";

export class HabitDetailModal extends Modal {
	private habit: Habit;
	private stateManager: StateManager;
	private skills: Skill[];
	private onSave: (updated: Habit) => void;

	constructor(app: App, habit: Habit, stateManager: StateManager, skills: Skill[], onSave: (updated: Habit) => void) {
		super(app);
		this.habit = { ...habit };
		this.stateManager = stateManager;
		this.skills = skills;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("life-rpg-premium-modal");
		contentEl.empty();

		// Header Section
		const header = contentEl.createDiv({ cls: "life-rpg-modal-header" });
		const iconContainer = header.createDiv({ cls: "life-rpg-habit-icon-large" });
		iconContainer.setText(this.habit.icon || "🔄");
		
		const titleContainer = header.createDiv({ cls: "life-rpg-modal-title-group" });
		titleContainer.createEl("h2", { text: this.habit.name, cls: "life-rpg-modal-title" });
		titleContainer.createEl("span", { 
			text: `Established: ${new Date(this.habit.createdAt).toLocaleDateString()}`, 
			cls: "life-rpg-modal-subtitle" 
		});

		// Tabs / Sections Navigation (Optional for future, currently flat)
		const body = contentEl.createDiv({ cls: "life-rpg-modal-body" });

		// --- STATISTICS SECTION ---
		const statsGrid = body.createDiv({ cls: "life-rpg-habit-stats-grid" });
		
		this.createStatCard(statsGrid, "🔥 Current Streak", `${this.habit.streak} Days`);
		this.createStatCard(statsGrid, "🏆 Max Streak", `${this.habit.maxStreak || this.habit.streak} Days`);
		this.createStatCard(statsGrid, "✅ Completions", formatNumber(this.habit.history ? Object.keys(this.habit.history).length : 0));
		this.createStatCard(statsGrid, "⚖️ Last Sync", this.habit.lastCompleted ? new Date(this.habit.lastCompleted).toLocaleDateString() : "Never");

		// --- CONFIGURATION SECTION ---
		body.createEl("h3", { text: "📜 Configuration", cls: "life-rpg-section-title" });
		
		new Setting(body)
			.setName("Habit Name")
			.setDesc("The label shown in your ritual list.")
			.addText(text => text
				.setValue(this.habit.name)
				.onChange(v => this.habit.name = v));

		new Setting(body)
			.setName("Ritual Inception")
			.setDesc("The date this ritual was established (YYYY-MM-DD). Streaks will not count before this date.")
			.addText(text => text
				.setPlaceholder("YYYY-MM-DD")
				.setValue(this.habit.startDate || this.habit.createdAt.split("T")[0])
				.onChange(v => {
					// Simple validation regex for YYYY-MM-DD
					if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
						this.habit.startDate = v;
					}
				}));

		new Setting(body)
			.setName("Icon")
			.setDesc("Emoji or icon Representing the habit.")
			.addText(text => text
				.setValue(this.habit.icon)
				.onChange(v => this.habit.icon = v));

		new Setting(body)
			.setName("Type")
			.setDesc("Is this a virtue (Good) or a vice (Bad)?")
			.addDropdown(drop => drop
				.addOption("good", "😇 Virtue")
				.addOption("bad", "😈 Vice")
				.setValue(this.habit.type)
				.onChange(v => this.habit.type = v as "good" | "bad"));

		new Setting(body)
			.setName("Severity")
			.setDesc("The impact this habit has on your character.")
			.addDropdown(drop => drop
				.addOption(String(Difficulty.Easy), "Easy")
				.addOption(String(Difficulty.Medium), "Medium")
				.addOption(String(Difficulty.Hard), "Hard")
				.setValue(String(this.habit.difficulty))
				.onChange(v => this.habit.difficulty = Number(v) as Difficulty));

		new Setting(body)
			.setName("Bound Skill")
			.setDesc("Which skill receives XP when this habit is performed?")
			.addDropdown(drop => {
				drop.addOption("none", "None");
				for (const s of this.skills) {
					drop.addOption(s.id, `${s.icon} ${s.name}`);
				}
				drop.setValue(this.habit.skillId || "none");
				drop.onChange(v => this.habit.skillId = v === "none" ? null : v);
			});

		// --- Energy Load (Only for Good Habits) ---
		if (this.habit.type === "good") {
			body.createEl("h3", { text: "🔋 Energy Load", cls: "life-rpg-section-title" });
			
			new Setting(body)
				.setName("Mental (M)")
				.addSlider(slider => slider
					.setLimits(0, 5, 1)
					.setValue(this.habit.energyM || 1)
					.setDynamicTooltip()
					.onChange(v => this.habit.energyM = v));

			new Setting(body)
				.setName("Physical (P)")
				.addSlider(slider => slider
					.setLimits(0, 5, 1)
					.setValue(this.habit.energyP || 1)
					.setDynamicTooltip()
					.onChange(v => this.habit.energyP = v));

			new Setting(body)
				.setName("Willpower (W)")
				.addSlider(slider => slider
					.setLimits(1, 5, 1)
					.setValue(this.habit.energyW || 1)
					.setDynamicTooltip()
					.onChange(v => this.habit.energyW = v));
		}

		// Footer Buttons
		const footer = contentEl.createDiv({ cls: "life-rpg-modal-footer" });
		
		const saveBtn = footer.createEl("button", { text: "Save Changes", cls: "life-rpg-btn life-rpg-btn-primary" });
		saveBtn.onclick = () => {
			this.onSave(this.habit);
			this.close();
		};

		const cancelBtn = footer.createEl("button", { text: "Cancel", cls: "life-rpg-btn" });
		cancelBtn.onclick = () => this.close();
		
		const deleteBtn = footer.createEl("button", { text: "Banish Habit", cls: "life-rpg-btn life-rpg-btn-danger" });
		deleteBtn.onclick = () => {
			if (confirm("Are you sure you want to banish this habit? History will be lost.")) {
				this.stateManager.removeHabit(this.habit.id);
				this.close();
			}
		};
	}

	private createStatCard(parent: HTMLElement, label: string, value: string) {
		const card = parent.createDiv({ cls: "life-rpg-stat-card-mini" });
		card.createEl("span", { text: label, cls: "life-rpg-stat-label" });
		card.createEl("span", { text: value, cls: "life-rpg-stat-value" });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
