// ============================================================================
// Life RPG — Character Sheet View
// Main sidebar ItemView with tabbed navigation across all panels.
// ============================================================================

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_CHARACTER_SHEET } from "../constants";
import { type StateManager } from "../state/StateManager";
import { type GameState } from "../types";
import { StatsPanel } from "./components/StatsPanel";
import { SkillsPanel } from "./components/SkillsPanel";
import { QuestsPanel } from "./components/QuestsPanel";
import { HabitsPanel } from "./components/HabitsPanel";
import { RewardsPanel } from "./components/RewardsPanel";
import { BossPanel } from "./components/BossPanel";
import { ActivityLogPanel } from "./components/ActivityLogPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { HabitHistoryModal } from "../modals/HabitHistoryModal";

type TabId = "stats" | "profile" | "quests" | "skills" | "habits" | "rewards" | "boss" | "log";

interface TabDefinition {
	id: TabId;
	label: string;
	icon: string;
}

const TABS: TabDefinition[] = [
	{ id: "stats", label: "Stats", icon: "sword" },
	{ id: "profile", label: "Profile", icon: "user" },
	{ id: "quests", label: "Quests", icon: "scroll" },
	{ id: "skills", label: "Skills", icon: "bar-chart" },
	{ id: "habits", label: "Habits", icon: "refresh-cw" },
	{ id: "rewards", label: "Store", icon: "shopping-cart" },
	{ id: "boss", label: "Boss", icon: "skull" },
	{ id: "log", label: "Log", icon: "list" },
];

export class CharacterSheetView extends ItemView {
	private stateManager: StateManager;
	private unsubscribe: (() => void) | null = null;
	private activeTab: TabId = "stats";
	private tabContentEl: HTMLElement | null = null;

	// Panel instances (lazy-created)
	private statsPanel: StatsPanel | null = null;
	private profilePanel: ProfilePanel | null = null;
	private questsPanel: QuestsPanel | null = null;
	private skillsPanel: SkillsPanel | null = null;
	private habitsPanel: HabitsPanel | null = null;
	private rewardsPanel: RewardsPanel | null = null;
	private bossPanel: BossPanel | null = null;
	private activityLogPanel: ActivityLogPanel | null = null;

	constructor(leaf: WorkspaceLeaf, stateManager: StateManager) {
		super(leaf);
		this.stateManager = stateManager;
	}

	getViewType(): string {
		return VIEW_TYPE_CHARACTER_SHEET;
	}

	getDisplayText(): string {
		return "Life RPG";
	}

	getIcon(): string {
		return "sword";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("life-rpg-container");

		// Build the UI structure
		this.buildUI(container);

		// Subscribe to state changes
		this.unsubscribe = this.stateManager.on(() => {
			this.renderActiveTab();
		});

		// Initial render
		this.renderActiveTab();
	}

	async onClose(): Promise<void> {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.destroyPanels();
	}

	// -------------------------------------------------------------------
	// UI Construction
	// -------------------------------------------------------------------

	private buildUI(container: HTMLElement): void {
		// Plugin title bar
		const titleBar = container.createDiv({ cls: "life-rpg-title-bar" });
		titleBar.createEl("h2", { text: "⚔️ Life RPG", cls: "life-rpg-title" });

		// Quick stats ribbon (always visible)
		const ribbon = container.createDiv({ cls: "life-rpg-ribbon" });
		ribbon.setAttribute("id", "life-rpg-ribbon");

		// Tab navigation
		const tabNav = container.createDiv({ cls: "life-rpg-tab-nav" });
		for (const tab of TABS) {
			const tabBtn = tabNav.createEl("button", {
				cls: `life-rpg-tab-btn ${this.activeTab === tab.id ? "life-rpg-tab-active" : ""}`,
			});
			tabBtn.setAttribute("data-tab", tab.id);

			const iconEl = tabBtn.createEl("span", { cls: "life-rpg-tab-icon" });
			setIcon(iconEl, tab.icon);

			tabBtn.createEl("span", { text: tab.label, cls: "life-rpg-tab-label" });

			tabBtn.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.updateTabHighlight(tabNav);
				this.renderActiveTab();
			});
		}

		// Tab content area
		this.tabContentEl = container.createDiv({ cls: "life-rpg-tab-content" });
	}

	private updateTabHighlight(tabNav: HTMLElement): void {
		const buttons = tabNav.querySelectorAll(".life-rpg-tab-btn");
		buttons.forEach((btn) => {
			const tabId = btn.getAttribute("data-tab");
			if (tabId === this.activeTab) {
				btn.addClass("life-rpg-tab-active");
			} else {
				btn.removeClass("life-rpg-tab-active");
			}
		});
	}

	// -------------------------------------------------------------------
	// Rendering
	// -------------------------------------------------------------------

	private renderActiveTab(): void {
		if (!this.tabContentEl) return;

		// Update the quick stats ribbon
		this.updateRibbon();

		// Destroy current panels
		this.destroyPanels();
		this.tabContentEl.empty();

		const state = this.stateManager.getState();

		switch (this.activeTab) {
			case "stats":
				this.statsPanel = new StatsPanel(this.tabContentEl);
				this.statsPanel.render(state.character);
				break;

			case "profile":
				this.profilePanel = new ProfilePanel(this.tabContentEl, this.stateManager);
				this.profilePanel.render(state.character);
				break;

			case "quests":
				this.questsPanel = new QuestsPanel(this.tabContentEl);
				const plugin = (this.stateManager as any).plugin;
				this.questsPanel.render(
					plugin.taskWatcher.getActiveTasks(),
					this.stateManager.getSettings(),
					state.character
				);
				break;

			case "skills":
				this.skillsPanel = new SkillsPanel(
					this.tabContentEl,
					this.stateManager
				);
				this.skillsPanel.render(state.skills);
				break;

			case "habits":
				this.habitsPanel = new HabitsPanel(
					this.tabContentEl,
					this.stateManager
				);
				this.habitsPanel.render(state.habits, state.skills);
				break;

			case "rewards":
				this.rewardsPanel = new RewardsPanel(
					this.tabContentEl,
					this.stateManager
				);
				this.rewardsPanel.render(state.rewards, state.character.gp);
				break;

			case "boss":
				this.bossPanel = new BossPanel(
					this.tabContentEl,
					this.stateManager
				);
				this.bossPanel.render(
					state.activeBoss,
					state.activeDungeon,
					state.totalBossesDefeated,
					state.totalDungeonsCleared
				);
				break;

			case "log":
				this.activityLogPanel = new ActivityLogPanel(
					this.tabContentEl,
					this.stateManager
				);
				this.activityLogPanel.render(state.eventLog);
				break;
		}
	}

	private updateRibbon(): void {
		const ribbon = this.contentEl.querySelector("#life-rpg-ribbon");
		if (!ribbon) return;
		ribbon.empty();

		const char = this.stateManager.getCharacter();
		const el = ribbon as HTMLElement;

		const items = [
			{ icon: "medal", text: `Lv.${char.level}` },
			{ icon: "heart", text: `${char.hp}/${char.maxHp}` },
			{ icon: "sparkles", text: `${char.xp}/${char.xpToNextLevel}` },
			{ icon: "coins", text: `${char.gp}` },
		];

		for (const item of items) {
			const span = el.createEl("span", { cls: "life-rpg-ribbon-item" });
			const iconEl = span.createEl("span", { cls: "life-rpg-ribbon-icon" });
			setIcon(iconEl, item.icon);
			span.createEl("span", {
				text: item.text,
				cls: "life-rpg-ribbon-value",
			});
		}
	}

	private destroyPanels(): void {
		this.statsPanel?.destroy();
		this.profilePanel?.destroy();
		this.questsPanel?.destroy();
		this.skillsPanel?.destroy();
		this.habitsPanel?.destroy();
		this.rewardsPanel?.destroy();
		this.bossPanel?.destroy();
		this.activityLogPanel?.destroy();

		this.statsPanel = null;
		this.profilePanel = null;
		this.questsPanel = null;
		this.skillsPanel = null;
		this.habitsPanel = null;
		this.rewardsPanel = null;
		this.bossPanel = null;
		this.activityLogPanel = null;
	}
}
