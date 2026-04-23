// ============================================================================
// Life RPG — Activity Log Panel
// Chronological, color-coded event log with filtering.
// ============================================================================

import { setIcon } from "obsidian";
import { type EventLogEntry, EventType } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { formatRelativeTime } from "../../utils/formatter";

export class ActivityLogPanel {
	public containerEl: HTMLElement;
	private stateManager: StateManager;
	private activeFilter: EventType | "all" = "all";
	private headerEl: HTMLElement;
	private filtersEl: HTMLElement;
	private listEl: HTMLElement;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-log-panel" });
		this.stateManager = stateManager;
		this.setupShell();
	}

	private setupShell() {
		const el = this.containerEl;
		
		this.headerEl = el.createDiv({ cls: "life-rpg-panel-header" });
		this.headerEl.createEl("h3", { text: "📜 Activity Log" });

		this.filtersEl = el.createDiv({ cls: "life-rpg-log-filters" });
		this.renderFilters();

		this.listEl = el.createDiv({ cls: "life-rpg-log-list" });
	}

	private renderFilters() {
		this.filtersEl.empty();
		const filterOptions: { label: string; icon?: string; value: EventType | "all" }[] = [
			{ label: "All", value: "all" },
			{ label: "Tasks", icon: "✅", value: EventType.TaskComplete },
			{ label: "Habits", icon: "🔄", value: EventType.HabitGood },
			{ label: "Boss", icon: "⚔️", value: EventType.BossDamageDealt },
			{ label: "Rewards", icon: "🛒", value: EventType.RewardPurchase },
			{ label: "Level Up", icon: "🔼", value: EventType.LevelUp },
		];

		for (const opt of filterOptions) {
			const btn = this.filtersEl.createEl("button", {
				cls: `life-rpg-filter-btn ${this.activeFilter === opt.value ? "life-rpg-filter-active" : ""}`,
			});
			if (opt.icon) {
				const iconEl = btn.createEl("span", { cls: "life-rpg-filter-icon" });
				iconEl.setText(opt.icon);
			}
			btn.createEl("span", { text: opt.label });
			btn.addEventListener("click", () => {
				this.activeFilter = opt.value;
				this.render(this.stateManager.getEventLog());
			});
		}
	}

	render(entries: EventLogEntry[]): void {
		const existingClearBtn = this.headerEl.querySelector(".life-rpg-btn-danger");
		if (entries.length > 0 && !existingClearBtn) {
			const clearBtn = this.headerEl.createEl("button", {
				text: "Clear",
				cls: "life-rpg-btn life-rpg-btn-small life-rpg-btn-danger",
			});
			clearBtn.addEventListener("click", () => {
				if (confirm("Clear all log entries?")) {
					this.stateManager.clearEventLog();
				}
			});
		} else if (entries.length === 0 && existingClearBtn) {
			existingClearBtn.remove();
		}

		const filtered =
			this.activeFilter === "all"
				? entries
				: entries.filter((e) => {
						if (this.activeFilter === EventType.HabitGood) {
							return (e.type === EventType.HabitGood || e.type === EventType.HabitBad);
						}
						if (this.activeFilter === EventType.BossDamageDealt) {
							return (e.type === EventType.BossDamageDealt || e.type === EventType.BossDefeated || e.type === EventType.BossAttack);
						}
						return e.type === this.activeFilter;
					});

		this.listEl.empty();

		if (filtered.length === 0) {
			this.listEl.createDiv({
				cls: "life-rpg-empty-state",
				text: this.activeFilter === "all"
					? "No activity yet. Complete tasks, log habits, or fight bosses to start your journey!"
					: "No entries matching this filter.",
			});
			return;
		}

		for (const entry of filtered.slice(0, 100)) {
			this.renderLogEntry(this.listEl, entry);
		}

		if (filtered.length > 100) {
			this.listEl.createEl("div", {
				text: `... and ${filtered.length - 100} more entries`,
				cls: "life-rpg-log-more",
			});
		}
	}

	private renderLogEntry(parent: HTMLElement, entry: EventLogEntry): void {
		const colorClass = this.getEntryColorClass(entry.type);
		const item = parent.createDiv({
			cls: `life-rpg-log-entry ${colorClass}`,
		});

		const content = item.createDiv({ cls: "life-rpg-log-content" });
		content.createEl("span", {
			text: entry.message,
			cls: "life-rpg-log-message",
		});

		const meta = item.createDiv({ cls: "life-rpg-log-meta" });
		meta.createEl("span", {
			text: formatRelativeTime(entry.timestamp),
			cls: "life-rpg-log-time",
		});

		// Show deltas as badges
		const badges = meta.createDiv({ cls: "life-rpg-log-badges" });
		if (entry.xpDelta > 0) {
			badges.createEl("span", {
				text: `+${entry.xpDelta} XP`,
				cls: "life-rpg-badge life-rpg-badge-xp",
			});
		}
		if (entry.gpDelta > 0) {
			badges.createEl("span", {
				text: `+${entry.gpDelta} GP`,
				cls: "life-rpg-badge life-rpg-badge-gp",
			});
		} else if (entry.gpDelta < 0) {
			badges.createEl("span", {
				text: `${entry.gpDelta} GP`,
				cls: "life-rpg-badge life-rpg-badge-gp-spend",
			});
		}
		if (entry.hpDelta < 0) {
			badges.createEl("span", {
				text: `${entry.hpDelta} HP`,
				cls: "life-rpg-badge life-rpg-badge-hp-loss",
			});
		} else if (entry.hpDelta > 0) {
			badges.createEl("span", {
				text: `+${entry.hpDelta} HP`,
				cls: "life-rpg-badge life-rpg-badge-hp-gain",
			});
		}
	}

	private getEntryColorClass(type: EventType): string {
		switch (type) {
			case EventType.TaskComplete:
			case EventType.HabitGood:
				return "life-rpg-log-positive";
			case EventType.HabitBad:
			case EventType.BossAttack:
			case EventType.HpDamage:
				return "life-rpg-log-negative";
			case EventType.LevelUp:
			case EventType.SkillUp:
			case EventType.BossDefeated:
			case EventType.DungeonCleared:
				return "life-rpg-log-legendary";
			case EventType.RewardPurchase:
				return "life-rpg-log-gold";
			case EventType.BossDamageDealt:
			case EventType.DungeonStageComplete:
				return "life-rpg-log-combat";
			case EventType.HpRegen:
				return "life-rpg-log-regen";
			default:
				return "";
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
