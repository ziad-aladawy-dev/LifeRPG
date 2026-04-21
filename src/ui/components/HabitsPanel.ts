// ============================================================================
// Life RPG — Habits Panel
// Renders good and bad habits with log buttons and streak tracking.
// ============================================================================

import { setIcon, Notice, normalizePath, TFile, TFolder } from "obsidian";
import { type Habit, type Skill, Difficulty, ItemSlot } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { logGoodHabit, logBadHabit, resolveOutstandingHabit, undoHabit, recalculateHabitStreak, isHabitDue } from "../../engine/HabitManager";
import { calculateHabitReward, streakBonusMultiplier } from "../../engine/GameEngine";
import { generateId } from "../../constants";
import { HabitDetailModal } from "../modals/HabitDetailModal";
import { HabitHistoryModal } from "../modals/HabitHistoryModal";
import { renderIcon } from "../../utils/uiUtils";

export class HabitsPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	// Use static to persist toggle state across tab switches within a session
	private static showUpcomingGood = false;
	private static showUpcomingBad = false;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-habits-panel" });
		this.stateManager = stateManager;
	}

	private isHabitDue(habit: Habit): boolean {
		const { isHabitDue } = require("../../engine/HabitManager");
		return isHabitDue(habit);
	}

	private calculateNextDueDate(habit: Habit): Date {
		const recurrence = habit.recurrenceDays || 1;
		const anchorDateStr = habit.startDate || habit.createdAt.split("T")[0];
		const [ay, am, ad] = anchorDateStr.split("-").map(Number);
		const anchorDate = new Date(ay, am - 1, ad);
		
		const todayParsed = new Date();
		const todayTime = new Date(todayParsed.getFullYear(), todayParsed.getMonth(), todayParsed.getDate()).getTime();
		const anchorTime = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate()).getTime();
		
		const diffDays = Math.round((todayTime - anchorTime) / (1000 * 60 * 60 * 24));
		
		if (diffDays < 0) return anchorDate;
		
		// Find the next multiple of recurrence strictly greater than diffDays
		// unless it's due today, in which case we might still want to show today or the one after.
		// Since this is used for cards NOT due today, we find the next one.
		const nextDueOffset = Math.ceil((diffDays + 0.1) / recurrence) * recurrence;
		return new Date(anchorTime + (nextDueOffset * 24 * 60 * 60 * 1000));
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
			const dueGood = goodHabits.filter(h => this.isHabitDue(h));
			const upcomingGood = goodHabits.filter(h => !this.isHabitDue(h));

			el.createEl("h4", { text: "✅ Good Habits", cls: "life-rpg-section-title life-rpg-section-good" });
			
			const goodList = el.createDiv({ cls: "life-rpg-habits-list" });
			for (const habit of dueGood) {
				const completedToday = habit.lastCompleted !== null && 
					new Date(habit.lastCompleted).toDateString() === new Date().toDateString();
				this.renderHabitCard(goodList, habit, completedToday);
			}

			if (upcomingGood.length > 0) {
				const toggleContainer = el.createDiv({ cls: "life-rpg-upcoming-toggle" });
				const toggleBtn = toggleContainer.createEl("button", {
					text: HabitsPanel.showUpcomingGood ? "Hide Upcoming Good Habits" : `Show Upcoming (${upcomingGood.length})`,
					cls: "life-rpg-btn-subtle life-rpg-btn-small",
				});
				
				toggleBtn.addEventListener("click", () => {
					HabitsPanel.showUpcomingGood = !HabitsPanel.showUpcomingGood;
					this.render(habits, skills);
				});

				if (HabitsPanel.showUpcomingGood) {
					const upcomingList = el.createDiv({ cls: "life-rpg-habits-list life-rpg-upcoming-list" });
					for (const habit of upcomingGood) {
						this.renderHabitCard(upcomingList, habit, false);
					}
				}
			}
		}

		// Bad habits section
		const badHabits = habits.filter((h: Habit) => h.type === "bad");
		if (badHabits.length > 0) {
			const dueBad = badHabits.filter(h => this.isHabitDue(h));
			const upcomingBad = badHabits.filter(h => !this.isHabitDue(h));

			el.createEl("h4", { text: "⛔ Bad Habits", cls: "life-rpg-section-title life-rpg-section-bad" });
			
			const badList = el.createDiv({ cls: "life-rpg-habits-list" });
			for (const habit of dueBad) {
				const completedToday = habit.lastCompleted !== null && 
					new Date(habit.lastCompleted).toDateString() === new Date().toDateString();
				this.renderHabitCard(badList, habit, completedToday);
			}

			if (upcomingBad.length > 0) {
				const toggleContainer = el.createDiv({ cls: "life-rpg-upcoming-toggle" });
				const toggleBtn = toggleContainer.createEl("button", {
					text: HabitsPanel.showUpcomingBad ? "Hide Upcoming Bad Habits" : `Show Upcoming (${upcomingBad.length})`,
					cls: "life-rpg-btn-subtle life-rpg-btn-small",
				});
				
				toggleBtn.addEventListener("click", () => {
					HabitsPanel.showUpcomingBad = !HabitsPanel.showUpcomingBad;
					this.render(habits, skills);
				});

				if (HabitsPanel.showUpcomingBad) {
					const upcomingList = el.createDiv({ cls: "life-rpg-habits-list life-rpg-upcoming-list" });
					for (const habit of upcomingBad) {
						this.renderHabitCard(upcomingList, habit, false);
					}
				}
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
		renderIcon(iconEl, habit.icon);

		const habitNameEl = nameRow.createEl("span", {
			text: habit.name,
			cls: "life-rpg-habit-name clickable-habit-name",
		});
		habitNameEl.style.cursor = "pointer";
		habitNameEl.title = "Click to open habit note";
		habitNameEl.onclick = (e) => {
			e.stopPropagation();
			this.openHabitNote(habit);
		};

		// Streak & info
		const infoRow = cardContent.createDiv({ cls: "life-rpg-habit-info" });

		// Always recalculate streak from history to fix drift bugs
		const liveStreak = recalculateHabitStreak(habit);
		if (liveStreak !== habit.streak) {
			this.stateManager.updateHabit(habit.id, { streak: liveStreak });
		}

		if (habit.recurrenceDays && habit.recurrenceDays > 1) {
			infoRow.createEl("span", {
				text: `⏳ Every ${habit.recurrenceDays}d`,
				cls: "life-rpg-habit-recurrence",
			});
		}

		const settings = this.stateManager.getSettings();
		const character = this.stateManager.getCharacter();
		const modifiers = this.stateManager.getGlobalModifiers();

		const baseReward = calculateHabitReward(habit, settings, character.attributes, modifiers);

		// --- Entire Card Intense Streak System ---
		if (liveStreak > 0) {
			let streakTier: string;
			const streakLabel = habit.type === "good" ? "streak" : "resisted";

			if (habit.type === "good") {
				if (liveStreak >= 365) { streakTier = "fire-ascendant"; }
				else if (liveStreak >= 250) { streakTier = "fire-quasar"; }
				else if (liveStreak >= 180) { streakTier = "fire-hypernova"; }
				else if (liveStreak >= 100) { streakTier = "fire-supernova"; }
				else if (liveStreak >= 60) { streakTier = "fire-inferno"; }
				else if (liveStreak >= 30) { streakTier = "fire-blaze"; }
				else if (liveStreak >= 14) { streakTier = "fire-flame"; }
				else if (liveStreak >= 7) { streakTier = "fire-kindle"; }
				else if (liveStreak >= 3) { streakTier = "fire-spark"; }
				else { streakTier = "fire-ember"; }
			} else {
				if (liveStreak >= 365) { streakTier = "frost-stasis"; }
				else if (liveStreak >= 250) { streakTier = "frost-void"; }
				else if (liveStreak >= 180) { streakTier = "frost-absolute"; }
				else if (liveStreak >= 100) { streakTier = "frost-permafrost"; }
				else if (liveStreak >= 60) { streakTier = "frost-glacial"; }
				else if (liveStreak >= 30) { streakTier = "frost-frozen"; }
				else if (liveStreak >= 14) { streakTier = "frost-cold"; }
				else if (liveStreak >= 7) { streakTier = "frost-chill"; }
				else if (liveStreak >= 3) { streakTier = "frost-cool"; }
				else { streakTier = "frost-calm"; }
			}

			// Add the intensity tier DIRECTLY to the overall card wrapper
			card.addClass(`intensity-${streakTier}`);

			// Replace tiny pill badge with an intense thematic stat block
			const intenseStat = cardContent.createEl("div", {
				cls: `life-rpg-intense-streak life-rpg-intense-${habit.type}`,
			});
			
			intenseStat.createEl("span", { text: `${liveStreak}`, cls: "streak-big-number" });
			intenseStat.createEl("span", { text: ` ${streakLabel}`, cls: "streak-big-label" });

			if (habit.type === "good" && liveStreak >= 7) {
				const bonus = streakBonusMultiplier(liveStreak);
				intenseStat.title = `${bonus.toFixed(1)}x streak bonus active!`;
			}
		}

		if (habit.type === "good") {
			const bonus = streakBonusMultiplier(liveStreak);
			const xpGain = Math.round(baseReward.xp * bonus);
			const gpGain = Math.round(baseReward.gp * bonus);

			infoRow.createEl("span", {
				text: `+${xpGain} XP, +${gpGain} GP`,
				cls: "life-rpg-habit-reward",
			});
		} else {
			// Show penalty for doing the bad habit
			infoRow.createEl("span", {
				text: `-${baseReward.hpDamage} HP if done`,
				cls: "life-rpg-habit-penalty",
			});
			// Show resist reward — resisting a bad habit earns a small XP/GP bonus
			const resistXp = Math.round(settings.baseXp * (settings.difficultyMultipliers[habit.difficulty] ?? 1) * 0.3);
			const resistGp = Math.round(settings.baseGp * (settings.difficultyMultipliers[habit.difficulty] ?? 1) * 0.2);
			if (resistXp > 0 || resistGp > 0) {
				infoRow.createEl("span", {
					text: `+${resistXp} XP, +${resistGp} GP if resisted`,
					cls: "life-rpg-habit-resist",
				});
			}
		}

		// Add last completed date if available
		const dateContainer = infoRow.createEl("span", {
			cls: "life-rpg-habit-date",
		});
		
		const isSameDayComplete = habit.lastCompleted && 
			new Date(habit.lastCompleted).toDateString() === new Date().toDateString();
		
		if (completedToday || isSameDayComplete) {
			dateContainer.setText(`🗓️ Today`);
		} else if (this.isHabitDue(habit)) {
			// If it's due today but not done, or has backlog
			dateContainer.setText(`🗓️ Today`);
		} else if (habit.recurrenceDays && habit.recurrenceDays > 1) {
			const nextDue = this.calculateNextDueDate(habit);
			const dateStr = nextDue.toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
			dateContainer.setText(`🗓️ Next: ${dateStr}`);
		} else if (habit.lastCompleted) {
			const dateStr = new Date(habit.lastCompleted).toLocaleDateString(undefined, {
				month: "short",
				day: "numeric",
			});
			dateContainer.setText(`🗓️ ${dateStr}`);
		} else {
			dateContainer.setText(`🗓️ Never`);
		}

		// Action buttons row
		const actions = card.createDiv({ cls: "life-rpg-habit-actions" });

		if (habit.type === "good" && (habit.outstandingDays || 0) > 0) {
			// Outstanding Backlog State (ONLY for good habits)
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
			const isDisabled = completedToday;
			
			const logBtn = actions.createEl("button", {
				cls: `life-rpg-btn ${habit.type === "good" ? "life-rpg-btn-success" : "life-rpg-btn-danger"}`,
				text: habit.type === "good" ? (completedToday ? "✓ Done" : "+") : (completedToday ? "✓ Logged" : "−"),
			});
			
			if (isDisabled) {
				logBtn.setAttribute("disabled", "true");
				logBtn.classList.add("life-rpg-btn-disabled");

				const undoBtn = actions.createEl("button", {
					cls: "life-rpg-btn-icon life-rpg-habit-undo",
					text: "↩️",
				});
				undoBtn.title = "Undo";
				undoBtn.addEventListener("click", () => this.logHabitUndo(habit));
			} else {
				logBtn.addEventListener("click", () => this.logHabit(habit));
			}
		}

		// Meta buttons (settings, history, delete) — same row, pushed right
		const metaSpacer = actions.createDiv({ cls: "life-rpg-habit-meta-spacer" });

		const detailsBtn = actions.createEl("button", { 
			cls: "life-rpg-btn-icon", 
			title: "View Details & Edit" 
		});
		setIcon(detailsBtn, "settings");
		detailsBtn.onclick = (e) => {
			e.stopPropagation();
			const app = (this.stateManager as any).app || (this.stateManager as any).plugin.app;
			const skills = this.stateManager.getSkills();
			new HabitDetailModal(app, habit, this.stateManager, skills, (updated) => {
				this.stateManager.updateHabit(habit.id, updated);
			}).open();
		};

		const historyBtn = actions.createEl("button", {
			text: "⌛",
			cls: "life-rpg-btn-icon",
		});
		historyBtn.title = "View History";
		historyBtn.addEventListener("click", () => {
			const app = (this.stateManager as any).app || (this.stateManager as any).plugin.app;
			new HabitHistoryModal(app, habit, this.stateManager).open();
		});

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
		const modifiers = this.stateManager.getGlobalModifiers();

		const result = resolveOutstandingHabit(
			habit,
			this.stateManager.getCharacter(),
			this.stateManager.getSkills(),
			this.stateManager.getSettings(),
			wasCompleted,
			modifiers
		);

		if (result.spEarned !== 0) {
			this.stateManager.addSkillPoints(result.spEarned);
		}

		// Notification for backlog resolution
		if (wasCompleted && settings.showNotifications) {
			const oldChar = character;
			const newChar = result.character;
			if (newChar.level > oldChar.level) {
				new Notice(`🎉 LEVEL UP! You reached Level ${newChar.level}!`, 5000);
			}
		}

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

		if (result.spEarned !== 0) {
			this.stateManager.addSkillPoints(result.spEarned);
		}

		this.stateManager.setCharacter(result.character);
		this.stateManager.updateHabit(habit.id, result.habit);
		for (const skill of result.skills) {
			this.stateManager.updateSkill(skill.id, skill);
		}
		for (const entry of result.logEntries) {
			this.stateManager.addLogEntry(entry);
		}
	}
	private async openHabitNote(habit: Habit): Promise<void> {
		const app = (this.stateManager as any).app || (this.stateManager as any).plugin.app;
		const settings = this.stateManager.getSettings();
		const folderPath = settings.habitNotesFolder || "Atlas/Habits";
		
		// Ensure folder exists
		try {
			if (!(await app.vault.adapter.exists(folderPath))) {
				await app.vault.createFolder(folderPath);
			}
		} catch (err) {
			// Folder might already exist or be nested
			const folders = folderPath.split("/");
			let currentPath = "";
			for (const folder of folders) {
				currentPath = currentPath ? `${currentPath}/${folder}` : folder;
				if (!(await app.vault.adapter.exists(currentPath))) {
					await app.vault.createFolder(currentPath);
				}
			}
		}

		const fileName = `${habit.name.replace(/[\\/:*?"<>|]/g, "-")}.md`;
		const filePath = normalizePath(`${folderPath}/${fileName}`);
		
		let file = app.vault.getAbstractFileByPath(filePath);
		
		if (!file) {
			const content = `# 🔄 Habit: ${habit.name}\n\n` +
				`- **Icon**: ${habit.icon}\n` +
				`- **Type**: ${habit.type === "good" ? "✅ Good" : "⛔ Bad"}\n` +
				`- **Difficulty**: ${Difficulty[habit.difficulty] || "Passive"}\n\n` +
				`---\n\n` +
				`## Notes\n`;
			
			file = await app.vault.create(filePath, content);
		}

		if (file instanceof TFile) {
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}
	}

	private logHabit(habit: Habit): void {
		const character = this.stateManager.getCharacter();
		const skills = this.stateManager.getSkills();
		const settings = this.stateManager.getSettings();
		const modifiers = this.stateManager.getGlobalModifiers();

		if (habit.type === "good") {
			const result = logGoodHabit(habit, character, skills, settings, modifiers);
			this.stateManager.setCharacter(result.character);
			this.stateManager.updateHabit(habit.id, result.habit);
			for (const skill of result.skills) {
				this.stateManager.updateSkill(skill.id, skill);
			}
			if (result.spEarned > 0) {
				this.stateManager.addSkillPoints(result.spEarned);
			}

			// Notification
			if (settings.showNotifications) {
				const oldChar = character;
				const newChar = result.character;
				if (newChar.level > oldChar.level) {
					new Notice(`🎉 LEVEL UP! You reached Level ${newChar.level}!`, 5000);
				}
				for (let i = 0; i < result.skills.length; i++) {
					const oldSkill = skills.find(s => s.id === result.skills[i].id);
					if (oldSkill && result.skills[i].level > oldSkill.level) {
						new Notice(`🎯 SKILL UP: ${result.skills[i].name} reached Level ${result.skills[i].level}!`, 4000);
					}
				}
			}
			for (const entry of result.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
			this.stateManager.incrementHabitsCompleted();
			
			if (result.foundItem) {
				this.stateManager.addItem(result.foundItem);
			}
		} else {
			const result = logBadHabit(habit, character, settings, modifiers);
			this.stateManager.setCharacter(result.character);
			this.stateManager.updateHabit(habit.id, result.habit);

			// Notification
			if (settings.showNotifications) {
				const damage = result.habit.hpPenalty || 0;
				if (damage > 0) {
					new Notice(`💔 Bad Habit: "${habit.name}" → -${damage} HP`, 4000);
				}
				if (result.character.level < character.level) {
					new Notice(`💀 YOU DIED! Level dropped to ${result.character.level}.`, 6000);
				}
			}

			for (const entry of result.logEntries) {
				this.stateManager.addLogEntry(entry);
			}
		}
	}

	private showEditHabitForm(habit: Habit, card: HTMLElement, cardContent: HTMLElement, actions: HTMLElement): void {
		cardContent.style.display = "none";
		actions.style.display = "none";

		const form = card.createDiv({ cls: "life-rpg-add-habit-form life-rpg-form" });

		// Name
		const nameInput = form.createEl("input", {
			type: "text",
			value: habit.name,
			placeholder: "Habit name",
			cls: "life-rpg-input",
		});
		nameInput.addEventListener("keydown", (e) => e.stopPropagation());

		// Icon
		const iconInput = form.createEl("input", {
			type: "text",
			value: habit.icon,
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.addEventListener("keydown", (e) => e.stopPropagation());
		iconInput.style.width = "120px";

		// Type
		const typeRow = form.createDiv({ cls: "life-rpg-form-row" });
		typeRow.createEl("label", { text: "Type:" });
		const typeSelect = typeRow.createEl("select", { cls: "life-rpg-select" });
		const optGood = typeSelect.createEl("option", { value: "good", text: "✅ Good Habit (+XP/GP)" });
		const optBad = typeSelect.createEl("option", { value: "bad", text: "⛔ Bad Habit (-HP)" });
		if (habit.type === "good") optGood.selected = true;
		else optBad.selected = true;

		// Difficulty
		const diffRow = form.createDiv({ cls: "life-rpg-form-row" });
		diffRow.createEl("label", { text: "Difficulty:" });
		const diffSelect = diffRow.createEl("select", { cls: "life-rpg-select" });
		diffSelect.addEventListener("keydown", (e) => e.stopPropagation());
		const optPass = diffSelect.createEl("option", { value: "1", text: "⚪ Passive" });
		const optEasy = diffSelect.createEl("option", { value: "2", text: "🟢 Easy" });
		const optChall = diffSelect.createEl("option", { value: "3", text: "🟡 Challenging" });
		const optHardc = diffSelect.createEl("option", { value: "4", text: "🟠 Hardcore" });
		const optMad = diffSelect.createEl("option", { value: "5", text: "🟣 Madhouse" });
		
		if (habit.difficulty === 1) optPass.selected = true;
		else if (habit.difficulty === 2) optEasy.selected = true;
		else if (habit.difficulty === 3) optChall.selected = true;
		else if (habit.difficulty === 4) optHardc.selected = true;
		else if (habit.difficulty === 5) optMad.selected = true;

		// Skill Selector
		const skillsList = this.stateManager.getSkills();
		const skillRow = form.createDiv({ cls: "life-rpg-form-row" });
		skillRow.createEl("label", { text: "Related Skill:" });
		const skillSelect = skillRow.createEl("select", { cls: "life-rpg-select" });
		skillSelect.addEventListener("keydown", (e) => e.stopPropagation());
		skillSelect.createEl("option", { value: "", text: "None" });
		for (const sk of skillsList) {
			const opt = skillSelect.createEl("option", { value: sk.id, text: `${sk.icon} ${sk.name}` });
			if (habit.skillId === sk.id) opt.selected = true;
		}

		// Buttons
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
			if (!name) return;

			this.stateManager.updateHabit(habit.id, {
				name,
				icon: iconInput.value.trim() || (typeSelect.value === "good" ? "check" : "x"),
				type: typeSelect.value as "good" | "bad",
				difficulty: parseInt(diffSelect.value, 10) as Difficulty,
				skillId: skillSelect.value || null,
			});
		});

		cancelBtn.addEventListener("click", () => {
			form.remove();
			cardContent.style.display = "";
			actions.style.display = "";
		});

		nameInput.focus();
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
		nameInput.addEventListener("keydown", (e) => e.stopPropagation());

		// Icon
		const iconInput = form.createEl("input", {
			type: "text",
			placeholder: "Icon (e.g., 'check' or 🧘)",
			cls: "life-rpg-input life-rpg-input-small",
		});
		iconInput.addEventListener("keydown", (e) => e.stopPropagation());
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
		diffSelect.addEventListener("keydown", (e) => e.stopPropagation());
		diffSelect.createEl("option", { value: "1", text: "⚪ Passive" });
		diffSelect.createEl("option", { value: "2", text: "🟢 Easy" });
		diffSelect.createEl("option", { value: "3", text: "🟡 Challenging" });
		diffSelect.createEl("option", { value: "4", text: "🟠 Hardcore" });
		diffSelect.createEl("option", { value: "5", text: "🟣 Madhouse" });

		// Recurrence
		const recurRow = form.createDiv({ cls: "life-rpg-form-row" });
		recurRow.createEl("label", { text: "Repeats:" });
		const recurInput = recurRow.createEl("input", {
			type: "number",
			cls: "life-rpg-input life-rpg-input-small",
			value: "1",
			attr: { min: "1" },
		});
		recurInput.addEventListener("keydown", (e) => e.stopPropagation());
		recurInput.style.width = "50px";
		recurRow.createEl("span", { text: "days", cls: "life-rpg-form-suffix" });

		// Start Date Picker
		const startRow = form.createDiv({ cls: "life-rpg-form-row" });
		startRow.createEl("label", { text: "Start Tracking From:" });
		const startSelect = startRow.createEl("select", { cls: "life-rpg-select" });
		startSelect.addEventListener("keydown", (e) => e.stopPropagation());
		
		const today = new Date();
		for (let i = 0; i < 14; i++) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateStr = date.toISOString().split("T")[0];
			startSelect.createEl("option", { 
				value: dateStr, 
				text: i === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
			});
		}

		// Skill Selector
		const skillRow = form.createDiv({ cls: "life-rpg-form-row" });
		skillRow.createEl("label", { text: "Related Skill:" });
		const skillSelect = skillRow.createEl("select", { cls: "life-rpg-select" });
		skillSelect.createEl("option", { value: "", text: "None" });
		for (const skill of skills) {
			skillSelect.createEl("option", { value: skill.id, text: `${skill.icon} ${skill.name}` });
		}

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
			if (!name) return;

			const habit: Habit = {
				id: generateId(),
				name,
				icon: iconInput.value.trim() || (typeSelect.value === "good" ? "check" : "x"),
				type: typeSelect.value as "good" | "bad",
				difficulty: parseInt(diffSelect.value, 10) as Difficulty,
				skillId: skillSelect.value || null,
				streak: 0,
				lastCompleted: null,
				xpReward: 0,
				gpReward: 0,
				hpPenalty: 0,
				outstandingDays: 0,
				lastEvaluatedDate: startSelect.value,
				recurrenceDays: recurInput.value ? parseInt(recurInput.value, 10) : 1,
				createdAt: new Date().toISOString(),
			};

			this.stateManager.addHabit(habit);
			form.remove();

			// If they picked a past date, immediately open the history modal
			if (startSelect.value !== new Date().toISOString().split("T")[0]) {
				const app = (this.stateManager as any).plugin.app;
				new HabitHistoryModal(app, habit, this.stateManager).open();
			}
		});

		cancelBtn.addEventListener("click", () => form.remove());
		nameInput.focus();
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
