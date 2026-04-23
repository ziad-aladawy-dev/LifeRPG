import { setIcon, TFile } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { type GameState, type TrackedTask } from "../../types";
import { getTodayStr } from "../../utils/dateUtils";
import { getTaskText } from "../../utils/parser";
import { isHabitDue } from "../../engine/HabitManager";

export class EnergyPanel {
	public containerEl: HTMLElement;
	private stateManager: StateManager;
	private statusEl: HTMLElement;
	private barFillEl: HTMLElement;
	private barInfoEl: HTMLElement;
	private contributorsEl: HTMLElement;
	private historyEl: HTMLElement;
	private batteryEls: Record<string, HTMLElement> = {};
	private batteryFillEls: Record<string, HTMLElement> = {};

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-energy-panel" });
		this.stateManager = stateManager;
		this.setupShell();
	}

	private setupShell() {
		const el = this.containerEl;
		
		el.createEl("h2", { text: "🔋 Daily Energy Budget", cls: "life-rpg-energy-header" });
		this.statusEl = el.createDiv({ cls: "life-rpg-energy-status" });
		
		const mainBar = el.createDiv({ cls: "life-rpg-energy-main-bar" });
		this.barInfoEl = mainBar.createDiv({ cls: "life-rpg-energy-bar-info" });
		
		const barOuter = mainBar.createDiv({ cls: "life-rpg-energy-bar-outer" });
		this.barFillEl = barOuter.createDiv({ cls: "life-rpg-energy-bar-fill" });
		
		const batteries = el.createDiv({ cls: "life-rpg-battery-grid" });
		const batteryTypes = [
			{ key: "m", label: "🧠 Mental" },
			{ key: "p", label: "🦾 Physical" },
			{ key: "w", label: "🔥 Willpower" }
		];
		for (const { key, label } of batteryTypes) {
			const battery = batteries.createDiv({ cls: `life-rpg-battery-card battery-${key}` });
			battery.createEl("span", { text: label, cls: "battery-label" });
			this.batteryEls[key] = battery.createEl("span", { text: "0", cls: "battery-value" });
			
			const miniBarOuter = battery.createDiv({ cls: "battery-bar-outer" });
			this.batteryFillEls[key] = miniBarOuter.createDiv({ cls: "battery-bar-fill" });
		}

		el.createEl("h3", { text: "📋 Today's Contributors", cls: "life-rpg-section-title" });
		this.contributorsEl = el.createDiv({ cls: "life-rpg-energy-list" });
		
		el.createEl("h3", { text: "📈 Energy Timeline (Last 7 Days)", cls: "life-rpg-section-title" });
		this.historyEl = el.createDiv({ cls: "life-rpg-energy-history-list" });
	}

	render(state: GameState, activeTasks: TrackedTask[]): void {
		const load = this.stateManager.calculateDailyEnergyLoad();
		const cap = this.stateManager.getDailyEnergyCap();
		const pct = Math.min(100, (load.total / cap) * 100);

		const statusText = load.total > cap ? "⚠️ EXHAUSTED (Burnout imminent)" : load.total > cap * 0.8 ? "🟡 Fatigue Setting In" : "🟢 Optimal Energy";
		this.statusEl.setText(statusText);
		this.statusEl.className = `life-rpg-energy-status-label ${load.total > cap ? "burnt-out" : ""}`;

		this.barInfoEl.innerHTML = `<span>Total Load</span> <span>${load.total} / ${cap} Points</span>`;
		this.barFillEl.style.width = `${pct}%`;
		this.barFillEl.className = `life-rpg-energy-bar-fill ${load.total > cap ? "is-over-cap" : ""}`;

		for (const key of ["m", "p", "w"]) {
			const val = (load as any)[key] || 0;
			this.batteryEls[key].setText(String(val));
			this.batteryFillEls[key].style.width = `${Math.min(100, (val / 15) * 100)}%`;
		}

		this.contributorsEl.empty();
		const today = getTodayStr();
		if (state.activeQuestIds) {
			for (const qId of state.activeQuestIds) {
				const meta = state.questRegistry[qId];
				if (!meta || !meta.deadline || meta.isHeading) continue;
				const deadlineDate = meta.deadline.split("T")[0];
				if (deadlineDate <= today) {
					const loadVal = (meta.energyM || 0) + (meta.energyP || 0) + (meta.energyW || 0);
					if (loadVal === 0) continue;
					const task = activeTasks.find(t => t.questId === qId);
					const taskName = meta.name || (task ? getTaskText(task.text) : `Quest ${qId}`);
					this.renderContributor(this.contributorsEl, "Quest", taskName, loadVal, meta, task);
				}
			}
		}
		if (state.completedTodayQuestIds) {
			for (const qId of state.completedTodayQuestIds) {
				const meta = state.questRegistry[qId];
				if (!meta || meta.isHeading) continue;
				const loadVal = (meta.energyM || 0) + (meta.energyP || 0) + (meta.energyW || 0);
				if (loadVal === 0) continue;
				const task = activeTasks.find(t => t.questId === qId);
				const taskName = meta.name || (task ? getTaskText(task.text) : `Quest ${qId}`);
				this.renderContributor(this.contributorsEl, "Quest", taskName, loadVal, meta, task, true);
			}
		}
		for (const habit of state.habits) {
			if (habit.type === "good" && isHabitDue(habit)) {
				const loadVal = (habit.energyM || 0) + (habit.energyP || 0) + (habit.energyW || 0);
				this.renderContributor(this.contributorsEl, "Habit", habit.name, loadVal, habit);
			}
		}

		this.renderHistory(this.historyEl, state.character.energyHistory);
	}

	private renderHistory(parent: HTMLElement, history: Record<string, any> = {}): void {
		parent.empty();
		const historyKeys = Object.keys(history).sort().reverse();
		if (historyKeys.length === 0) {
			parent.createDiv({ 
				text: "No historical data recorded yet. History is saved during the daily rollover.", 
				cls: "life-rpg-empty-history" 
			});
			return;
		}
		for (const dateKey of historyKeys.slice(0, 7)) {
			const entry = history[dateKey];
			const dayCard = parent.createDiv({ cls: "life-rpg-energy-history-card" });
			const dayHeader = dayCard.createDiv({ cls: "history-card-header" });
			dayHeader.createEl("span", { text: dateKey, cls: "history-date" });
			dayHeader.createEl("span", { text: `${entry.total} / ${entry.cap} pts`, cls: "history-total" });
			const barContainer = dayCard.createDiv({ cls: "history-mini-bars" });
			this.renderMiniBar(barContainer, "m", entry.m || 0);
			this.renderMiniBar(barContainer, "p", entry.p || 0);
			this.renderMiniBar(barContainer, "w", entry.w || 0);
		}
	}

	private renderMiniBar(parent: HTMLElement, type: string, val: number): void {
		const row = parent.createDiv({ cls: "history-mini-bar-row" });
		const outer = row.createDiv({ cls: `mini-bar-outer bar-${type}` });
		const fill = outer.createDiv({ cls: "mini-bar-fill" });
		fill.style.width = `${Math.min(100, (val / 15) * 100)}%`;
		row.createEl("span", { text: `${type.toUpperCase()}: ${val}`, cls: "mini-bar-value" });
		outer.title = `${type.toUpperCase()}: ${val} pts`;
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