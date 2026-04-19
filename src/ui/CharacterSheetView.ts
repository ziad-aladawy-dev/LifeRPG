// ============================================================================
// Life RPG — Character Sheet View
// Main sidebar ItemView with tabbed navigation across all panels.
// ============================================================================

import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_CHARACTER_SHEET } from "../constants";
import { type StateManager } from "../state/StateManager";
import { type GameState, ItemSlot } from "../types";
import { StatsPanel } from "./components/StatsPanel";
import { SkillsPanel } from "./components/SkillsPanel";
import { QuestsPanel } from "./components/QuestsPanel";
import { HabitsPanel } from "./components/HabitsPanel";
import { RewardsPanel } from "./components/RewardsPanel";
import { BossPanel } from "./components/BossPanel";
import { ActivityLogPanel } from "./components/ActivityLogPanel";
import { ProfilePanel } from "./components/ProfilePanel";
import { InventoryPanel } from "./components/InventoryPanel";
import { HabitHistoryModal } from "./modals/HabitHistoryModal";
import { EventType } from "../types";
import { SkillTreePanel } from "./components/SkillTreePanel";

type TabId = "stats" | "profile" | "inventory" | "quests" | "skills" | "skill_tree" | "habits" | "rewards" | "boss" | "log";

interface TabDefinition {
	id: TabId;
	label: string;
	icon: string;
}

const TABS: TabDefinition[] = [
	{ id: "stats", label: "📊 Stats", icon: "sword" },
	{ id: "profile", label: "👤 Profile", icon: "user" },
	{ id: "inventory", label: "🎒 Inventory", icon: "briefcase" },
	{ id: "quests", label: "📜 Quests", icon: "scroll" },
	{ id: "skills", label: "🎯 Skills", icon: "bar-chart" },
	{ id: "skill_tree", label: "🌳 Tree", icon: "tree" },
	{ id: "habits", label: "🔄 Habits", icon: "refresh-cw" },
	{ id: "rewards", label: "💰 Store", icon: "shopping-cart" },
	{ id: "boss", label: "💀 Boss", icon: "skull" },
	{ id: "log", label: "📝 Log", icon: "list" },
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
	private inventoryPanel: InventoryPanel | null = null;
	private skillTreePanel: SkillTreePanel | null = null;
	private isChroniclePlaying = false;

	constructor(leaf: WorkspaceLeaf, stateManager: StateManager) {
		super(leaf);
		this.stateManager = stateManager;
	}

	getViewType(): string {
		return VIEW_TYPE_CHARACTER_SHEET;
	}

	getDisplayText(): string {
		return "Oathbound";
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
			if (!this.isChroniclePlaying) {
				this.renderActiveTab();
			}
		});

		// Listen for custom tab switch event
		this.registerEvent(
			(this.app.workspace as any).on("life-rpg:switch-tab", (data: { tabId: TabId }) => {
				this.activeTab = data.tabId;
				const tabNav = this.contentEl.querySelector(".life-rpg-tab-nav") as HTMLElement;
				if (tabNav) this.updateTabHighlight(tabNav);
				this.renderActiveTab();
			})
		);

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
		const titleContainer = titleBar.createDiv({ cls: "life-rpg-epic-container" });
		titleContainer.createEl("span", { text: "⚔️", cls: "life-rpg-epic-icon" });
		titleContainer.createEl("h2", { text: "OATHBOUND", cls: "life-rpg-epic-title" });

		// Quick stats ribbon (always visible)
		const ribbon = container.createDiv({ cls: "life-rpg-ribbon" });
		ribbon.setAttribute("id", "life-rpg-ribbon");

		// Tab navigation
		const tabNav = container.createDiv({ cls: "life-rpg-tab-nav" });
		this.setupDraggableTabs(tabNav);
		
		for (const tab of TABS) {
			const tabBtn = tabNav.createEl("button", {
				cls: `life-rpg-tab-btn ${this.activeTab === tab.id ? "life-rpg-tab-active" : ""}`,
			});
			tabBtn.setAttribute("data-tab", tab.id);

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

	private setupDraggableTabs(tabNav: HTMLElement): void {
		let isDown = false;
		let startX: number;
		let scrollLeft: number;

		tabNav.addEventListener("mousedown", (e) => {
			isDown = true;
			tabNav.addClass("active");
			startX = e.pageX - tabNav.offsetLeft;
			scrollLeft = tabNav.scrollLeft;
		});

		tabNav.addEventListener("mouseleave", () => {
			isDown = false;
		});

		tabNav.addEventListener("mouseup", () => {
			isDown = false;
		});

		tabNav.addEventListener("mousemove", (e) => {
			if (!isDown) return;
			e.preventDefault();
			const x = e.pageX - tabNav.offsetLeft;
			const walk = (x - startX) * 2; // scroll-fast
			tabNav.scrollLeft = scrollLeft - walk;
		});
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
				this.statsPanel = new StatsPanel(this.tabContentEl, this.stateManager);
				this.statsPanel.render(state.character);
				break;

			case "profile":
				this.profilePanel = new ProfilePanel(this.tabContentEl, this.stateManager);
				this.profilePanel.render(state.character);
				break;

			case "inventory":
				this.inventoryPanel = new InventoryPanel(this.tabContentEl, this.stateManager);
				this.inventoryPanel.render();
				break;

			case "quests": {
				this.questsPanel = new QuestsPanel(this.tabContentEl, this.app);
				const plugin = (this.stateManager as any).plugin;
				
				const modifiers = this.stateManager.getGlobalModifiers();

				this.questsPanel.render(
					plugin.taskWatcher.getActiveTasks(),
					this.stateManager.getSettings(),
					state.character,
					modifiers
				);
				break;
			}

			case "skills":
				this.skillsPanel = new SkillsPanel(
					this.tabContentEl,
					this.stateManager
				);
				this.skillsPanel.render(state.skills);
				break;

			case "skill_tree":
				this.skillTreePanel = new SkillTreePanel(
					this.tabContentEl,
					this.stateManager
				);
				this.skillTreePanel.render();
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
			{ icon: "🏅", text: `Lv.${char.level}` },
			{ icon: "❤️", text: `${char.hp}/${char.maxHp}` },
			{ icon: "✨", text: `${char.xp}/${char.xpToNextLevel}` },
			{ icon: "⭐", text: `${this.stateManager.getSkillPoints()} SP` },
			{ icon: "💰", text: `${char.gp}` },
		];

		for (const item of items) {
			const span = el.createEl("span", { cls: "life-rpg-ribbon-item" });
			const iconEl = span.createEl("span", { cls: "life-rpg-ribbon-icon" });
			iconEl.setText(item.icon);
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
		this.skillTreePanel?.destroy();

		this.statsPanel = null;
		this.profilePanel = null;
		this.questsPanel = null;
		this.skillsPanel = null;
		this.habitsPanel = null;
		this.rewardsPanel = null;
		this.bossPanel = null;
		this.activityLogPanel = null;
		this.skillTreePanel = null;
	}
}
