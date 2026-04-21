import { setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { type GameState, type TrackedTask } from "../../types";
import { getTodayStr } from "../../utils/dateUtils";

export class EnergyPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-energy-panel" });
		this.stateManager = stateManager;
	}

	render(state: GameState, activeTasks: TrackedTask[]): void {
		const el = this.containerEl;
		el.empty();

		const load = this.stateManager.calculateDailyEnergyLoad();
		const cap = this.stateManager.getSettings().dailyEnergyCap || 30;
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

		// Dated Tasks
		const today = getTodayStr();
		for (const qId in state.questRegistry) {
			const meta = state.questRegistry[qId];
			const dates = [meta.deadline, meta.startDate, meta.endDate]
				.filter(d => !!d)
				.map(d => d!.split("T")[0]);
			
			if (dates.includes(today)) {
				const loadVal = (meta.energyM || 0) + (meta.energyP || 0) + (meta.energyW || 0);
				const task = activeTasks.find(t => t.questId === qId);
				const taskText = task ? task.text.replace(/\[id: [a-z0-9]+\]/g, "").replace(/^[\s]*[-*]\s\[[ xX]\]\s*/, "") : `Quest ${qId}`;
				this.renderContributor(list, "Quest", taskText, loadVal, meta, task);
			}
		}

		// Habits
		for (const habit of state.habits) {
			const { isHabitDue } = require("../../engine/HabitManager");
			if (habit.type === "good" && isHabitDue(habit)) {
				const loadVal = (habit.energyM || 0) + (habit.energyP || 0) + (habit.energyW || 0);
				this.renderContributor(list, "Habit", habit.name, loadVal, habit);
			}
		}
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

	private renderContributor(parent: HTMLElement, type: string, name: string, val: number, data: any, task?: TrackedTask): void {
		if (val === 0) return;

		const row = parent.createDiv({ cls: `life-rpg-contributor-row ${task ? "is-clickable" : ""}` });
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
			await leaf.openFile(file, { eState: { line: task.lineNumber - 1 } });
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
