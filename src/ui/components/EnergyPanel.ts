import { setIcon, TFile } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { type GameState, type TrackedTask } from "../../types";
import { getTodayStr } from "../../utils/dateUtils";
import { getTaskText } from "../../utils/parser";

export class EnergyPanel {
	public containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-energy-panel" });
		this.stateManager = stateManager;
	}

	render(state: GameState, activeTasks: TrackedTask[]): void {
		const el = this.containerEl;
		el.empty();

		const load = this.stateManager.calculateDailyEnergyLoad();
		const cap = this.stateManager.getDailyEnergyCap();
		const pct = Math.min(100, (load.total / cap) * 100);

		// --- HEADER ---
		const header = el.createDiv({ cls: "life-rpg-energy-header" });
		header.createEl("h2", { text: "🔋 Daily Energy Budget" });
		
		const status = el.createDiv({ cls: "life-rpg-energy-status" });
		const statusText = load.total > cap ? "⚠️ EXHAUSTED (Burnout imminent)" : load.total > cap * 0.8 ? "🟡 Fatigue Setting In" : "🟢 Optimal Energy";
		status.createEl("span", { text: statusText, cls: `life-rpg-energy-status-label ${load.total > cap ? "burnt-out" : ""}` });

		// --- MAIN PROGRESS BAR ---
		const mainBar = el.createDiv({ cls: "life-rpg-energy-main-bar" });
		const barInfo = mainBar.createDiv({ cls: "life-rpg-energy-bar-info" });
		barInfo.createEl("span", { text: "Total Load" });
		barInfo.createEl("span", { text: `${load.total} / ${cap} Points` });

		const barOuter = mainBar.createDiv({ cls: "life-rpg-energy-bar-outer" });
		const barFill = barOuter.createDiv({ cls: "life-rpg-energy-bar-fill" });
		barFill.style.width = `${pct}%`;
		if (load.total > cap) barFill.addClass("is-over-cap");

		// --- BATTERY BREAKDOWN ---
		const batteries = el.createDiv({ cls: "life-rpg-battery-grid" });
		
		this.renderBattery(batteries, "🧠 Mental", load.m, "m");
		this.renderBattery(batteries, "🦾 Physical", load.p, "p");
		this.renderBattery(batteries, "🔥 Willpower", load.w, "w");

		// --- CONTRIBUTORS ---
		el.createEl("h3", { text: "📋 Today's Contributors", cls: "life-rpg-section-title" });
		const list = el.createDiv({ cls: "life-rpg-energy-list" });

		// Task Rollover Logic Check (Internal)
		const { isHabitDue } = require("../../engine/HabitManager");

		// Dated Tasks (Strict Deadline & Carryover)
		const today = getTodayStr();
		if (state.activeQuestIds) {
			for (const qId of state.activeQuestIds) {
				const meta = state.questRegistry[qId];
				if (!meta || !meta.deadline || meta.isHeading) continue;
				
				const deadlineDate = meta.deadline.split("T")[0];
				
				// Carryover logic: if deadline is today OR in the past, it drains energy
				if (deadlineDate <= today) {
					const loadVal = (meta.energyM || 0) + (meta.energyP || 0) + (meta.energyW || 0);
					if (loadVal === 0) continue;
					
					const task = activeTasks.find(t => t.questId === qId);
					const taskName = meta.name || (task ? getTaskText(task.text) : `Quest ${qId}`);
					this.renderContributor(list, "Quest", taskName, loadVal, meta, task);
				}
			}
		}

		// Completed Today Tasks (Expended Effort)
		if (state.completedTodayQuestIds) {
			for (const qId of state.completedTodayQuestIds) {
				const meta = state.questRegistry[qId];
				if (!meta || meta.isHeading) continue;

				const loadVal = (meta.energyM || 0) + (meta.energyP || 0) + (meta.energyW || 0);
				if (loadVal === 0) continue;

				const task = activeTasks.find(t => t.questId === qId);
				const taskName = meta.name || (task ? getTaskText(task.text) : `Quest ${qId}`);
				
				// Identify as completed quest
				this.renderContributor(list, "Quest", taskName, loadVal, meta, task, true);
			}
		}

		// Habits
		for (const habit of state.habits) {
			if (habit.type === "good" && isHabitDue(habit)) {
				const loadVal = (habit.energyM || 0) + (habit.energyP || 0) + (habit.energyW || 0);
				this.renderContributor(list, "Habit", habit.name, loadVal, habit);
			}
		}

		// --- HISTORY ---
		this.renderHistory(el, state.character.energyHistory);
	}

	private renderHistory(parent: HTMLElement, history: Record<string, any> = {}): void {
		parent.createEl("h3", { text: "📈 Energy Timeline (Last 7 Days)", cls: "life-rpg-section-title" });
		const historyKeys = Object.keys(history).sort().reverse();
		
		if (historyKeys.length === 0) {
			parent.createDiv({ 
				text: "No historical data recorded yet. History is saved during the daily rollover.", 
				cls: "life-rpg-empty-history" 
			});
			return;
		}

		const historyContainer = parent.createDiv({ cls: "life-rpg-energy-history-list" });

		for (const dateKey of historyKeys.slice(0, 7)) {
			const entry = history[dateKey];
			const dayCard = historyContainer.createDiv({ cls: "life-rpg-energy-history-card" });
			
			const dayHeader = dayCard.createDiv({ cls: "history-card-header" });
			dayHeader.createEl("span", { text: dateKey, cls: "history-date" });
			dayHeader.createEl("span", { text: `${entry.total} / ${entry.cap} pts`, cls: "history-total" });

			const barContainer = dayCard.createDiv({ cls: "history-mini-bars" });
			this.renderMiniBar(barContainer, "m", entry.m);
			this.renderMiniBar(barContainer, "p", entry.p);
			this.renderMiniBar(barContainer, "w", entry.w);
		}
	}

	private renderMiniBar(parent: HTMLElement, type: string, val: number): void {
		const outer = parent.createDiv({ cls: `mini-bar-outer bar-${type}` });
		const fill = outer.createDiv({ cls: "mini-bar-fill" });
		const pct = Math.min(100, (val / 15) * 100);
		fill.style.width = `${pct}%`;
		outer.title = `${type.toUpperCase()}: ${val} pts`;
	}

	private renderBattery(parent: HTMLElement, label: string, val: number, type: string): void {
		const battery = parent.createDiv({ cls: `life-rpg-battery-card battery-${type}` });
		battery.createEl("span", { text: label, cls: "battery-label" });
		battery.createEl("span", { text: `${val}`, cls: "battery-value" });
		
		const miniBarOuter = battery.createDiv({ cls: "battery-bar-outer" });
		const miniBarFill = miniBarOuter.createDiv({ cls: "battery-bar-fill" });
		const batteryPct = Math.min(100, (val / 15) * 100);
		miniBarFill.style.width = `${batteryPct}%`;
	}

	private renderContributor(parent: HTMLElement, type: string, name: string, val: number, data: any, task?: TrackedTask, isCompleted: boolean = false): void {
		if (val === 0) return;

		const row = parent.createDiv({ cls: `life-rpg-contributor-row ${task ? "is-clickable" : ""} ${isCompleted ? "is-completed" : ""}` });
		const icon = row.createDiv({ cls: "contributor-type-icon" });
		setIcon(icon, type === "Quest" ? "scroll" : "repeat");
		
		const info = row.createDiv({ cls: "contributor-info" });
		info.createEl("span", { text: name, cls: "contributor-name" });
		info.createEl("span", { 
			text: `M:${data.energyM || 0} P:${data.energyP || 0} W:${data.energyW || 0}`, 
			cls: "contributor-details" 
		});

		row.createDiv({ text: `${val} pts`, cls: "contributor-points" });

		if (task) {
			row.onclick = () => this.openTaskSource(task);
			row.title = "Click to jump to quest source";
		}
	}

	private async openTaskSource(task: TrackedTask) {
		const app = (this.stateManager as any).plugin.app;
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (file instanceof TFile) {
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(file, { eState: { line: task.line - 1 } });
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
