// ============================================================================
// Life RPG — Activity Log Panel
// Chronological, color-coded event log with filtering.
// ============================================================================

import { setIcon } from "obsidian";
import { type EventLogEntry, EventType } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { formatRelativeTime } from "../../utils/formatter";

export class ActivityLogPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;
	private activeFilter: EventType | "all" = "all";

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-log-panel" });
		this.stateManager = stateManager;
	}

	render(entries: EventLogEntry[]): void {
		const el = this.containerEl;
		el.empty();

		// Header
		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "📜 Activity Log" });

		if (entries.length > 0) {
			const clearBtn = header.createEl("button", {
				text: "Clear",
				cls: "life-rpg-btn life-rpg-btn-small life-rpg-btn-danger",
			});
			clearBtn.addEventListener("click", () => {
				if (confirm("Clear all log entries?")) {
					this.stateManager.clearEventLog();
				}
			});
		}

		// Filters
		const filters = el.createDiv({ cls: "life-rpg-log-filters" });
		const filterOptions: { label: string; icon?: string; value: EventType | "all" }[] = [
			{ label: "All", value: "all" },
			{ label: "Tasks", icon: "check-circle", value: EventType.TaskComplete },
			{ label: "Habits", icon: "refresh-cw", value: EventType.HabitGood },
			{ label: "Boss", icon: "swords", value: EventType.BossDamageDealt },
			{ label: "Rewards", icon: "shopping-cart", value: EventType.RewardPurchase },
			{ label: "Level Up", icon: "arrow-up-circle", value: EventType.LevelUp },
		];

		for (const opt of filterOptions) {
			const btn = filters.createEl("button", {
				cls: `life-rpg-filter-btn ${this.activeFilter === opt.value ? "life-rpg-filter-active" : ""}`,
			});
			if (opt.icon) {
				const iconEl = btn.createEl("span", { cls: "life-rpg-filter-icon" });
				setIcon(iconEl, opt.icon);
			}
			btn.createEl("span", { text: opt.label });
			btn.addEventListener("click", () => {
				this.activeFilter = opt.value;
				this.render(this.stateManager.getEventLog());
			});
		}

		// Filter entries
		const filtered =
			this.activeFilter === "all"
				? entries
				: entries.filter((e) => {
						if (this.activeFilter === EventType.HabitGood) {
							return (
								e.type === EventType.HabitGood ||
								e.type === EventType.HabitBad
							);
						}
						if (this.activeFilter === EventType.BossDamageDealt) {
							return (
								e.type === EventType.BossDamageDealt ||
								e.type === EventType.BossDefeated ||
								e.type === EventType.BossAttack
							);
						}
						return e.type === this.activeFilter;
					});

		if (filtered.length === 0) {
			el.createDiv({
				cls: "life-rpg-empty-state",
				text: this.activeFilter === "all"
					? "No activity yet. Complete tasks, log habits, or fight bosses to start your journey!"
					: "No entries matching this filter.",
			});
			return;
		}

		// Log entries list
		const list = el.createDiv({ cls: "life-rpg-log-list" });
		for (const entry of filtered.slice(0, 100)) {
			this.renderLogEntry(list, entry);
		}

		if (filtered.length > 100) {
			list.createEl("div", {
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
