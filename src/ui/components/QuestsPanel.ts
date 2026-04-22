// ============================================================================
// Life RPG — Quests Panel
// Displays all currently tracked active (unchecked) tasks.
// ============================================================================

import { setIcon } from "obsidian";
import { Difficulty, TaskPriority, type TrackedTask, type PluginSettings, type CharacterState, type TaskMetadata } from "../../types";
import { parseTaskMetadata, getTaskText } from "../../utils/parser";
import { calculateTaskReward, calculateGlobalModifiers } from "../../engine/GameEngine";
import { type StateManager } from "../../state/StateManager";
import { QuestEditModal } from "../modals/QuestEditModal";
import { renderBadge } from "../../utils/uiUtils";

export class QuestsPanel {
	private app: any;
	public containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, app: any, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-quests-panel" });
		this.app = app;
		this.stateManager = stateManager;
	}

	private renderToolbar(settings: PluginSettings): void {
		const toolbar = this.containerEl.createDiv({ cls: "life-rpg-quests-toolbar" });

		// 1. View Modes
		const viewModes = toolbar.createDiv({ cls: "life-rpg-toolbar-group" });
		const fileBtn = viewModes.createEl("button", { 
			cls: `life-rpg-toolbar-btn ${settings.questViewMode === "file" ? "is-active" : ""}`,
			title: "Group by File (Hierarchy)"
		});
		setIcon(fileBtn, "files");
		fileBtn.addEventListener("click", () => {
			this.stateManager.updateSettings({ questViewMode: "file" });
		});

		const dayBtn = viewModes.createEl("button", { 
			cls: `life-rpg-toolbar-btn ${settings.questViewMode === "day" ? "is-active" : ""}`,
			title: "Group by Deadline (Timeline)"
		});
		setIcon(dayBtn, "calendar-days");
		dayBtn.addEventListener("click", () => {
			this.stateManager.updateSettings({ questViewMode: "day" });
		});

		// 2. Search
		const searchContainer = toolbar.createDiv({ cls: "life-rpg-toolbar-search" });
		const searchInput = searchContainer.createEl("input", {
			type: "text",
			placeholder: "Search quests...",
			value: settings.questSearch || ""
		});
		searchInput.addEventListener("input", (e) => {
			const val = (e.target as HTMLInputElement).value;
			this.stateManager.updateSettings({ questSearch: val });
		});

		// 3. Sorting
		const sorts = toolbar.createDiv({ cls: "life-rpg-toolbar-group" });
		
		const sortConfigs = [
			{ key: "mental", label: "M", title: "Mental Points" },
			{ key: "physical", label: "P", title: "Physical Points" },
			{ key: "willpower", label: "W", title: "Willpower Points" },
			{ key: "total", label: "Σ", title: "Total Points" },
			{ key: "priority", label: "Prio", title: "Priority" },
			{ key: "difficulty", label: "Diff", title: "Difficulty" },
			{ key: "deadline", label: "Date", title: "Deadline" }
		] as const;

		sortConfigs.forEach(conf => {
			const active = settings.questSortBy === conf.key;
			const btn = sorts.createEl("button", {
				cls: `life-rpg-toolbar-btn ${active ? "is-active" : ""}`,
				text: conf.label,
				title: `Sort by ${conf.title}`
			});
			if (active) {
				const arrow = settings.questSortDir === "asc" ? " ↑" : " ↓";
				btn.innerText += arrow;
			}
			btn.addEventListener("click", () => {
				const newDir = (active && settings.questSortDir === "desc") ? "asc" : "desc";
				this.stateManager.updateSettings({ 
					questSortBy: conf.key, 
					questSortDir: newDir 
				});
			});
		});

		// Reset Button
		const resetBtn = toolbar.createEl("button", { 
			cls: "life-rpg-toolbar-btn",
			title: "Reset Filters"
		});
		setIcon(resetBtn, "refresh-cw");
		resetBtn.addEventListener("click", () => {
			this.stateManager.updateSettings({
				questSortBy: "none",
				questSortDir: "desc",
				questSearch: ""
			});
		});
	}

	render(activeTasks: TrackedTask[], settings: PluginSettings, character: CharacterState, globalModifiers: ReturnType<typeof calculateGlobalModifiers>): void {
		const el = this.containerEl;
		
		// Capture scroll of the nearest scrollable ancestor (usually .life-rpg-container)
		const scrollContainer = el.closest(".life-rpg-container") || el;
		const oldScrollTop = scrollContainer.scrollTop;
		
		el.empty();
		el.addClass("life-rpg-quests-page");

		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "📜 Active Quests" });

		// Render the toolbar
		this.renderToolbar(settings);

		if (activeTasks.length === 0) {
			el.createDiv({
				cls: "life-rpg-empty-state",
				text: "No active quests found.",
			});
			return;
		}

		// 1. Data Enrichment
		const enrichedTasks = activeTasks.map(t => {
			let meta = parseTaskMetadata(t.text);
			if (t.questId) {
				const registeredMeta = this.stateManager.getQuestMetadata(t.questId);
				if (registeredMeta) meta = { ...meta, ...registeredMeta };
			}
			const totalPoints = (meta.energyM || 0) + (meta.energyP || 0) + (meta.energyW || 0);
			return { task: t, meta, totalPoints };
		});

		// 2. Filter: Search
		let filtered = enrichedTasks;
		if (settings.questSearch) {
			const query = settings.questSearch.toLowerCase();
			filtered = filtered.filter(item => {
				const text = getTaskText(item.task.text).toLowerCase();
				return text.includes(query);
			});
		}

		// 3. Sort
		if (settings.questSortBy !== "none") {
			filtered.sort((a, b) => {
				let valA: any = 0;
				let valB: any = 0;

				switch(settings.questSortBy) {
					case "mental": valA = a.meta.energyM || 0; valB = b.meta.energyM || 0; break;
					case "physical": valA = a.meta.energyP || 0; valB = b.meta.energyP || 0; break;
					case "willpower": valA = a.meta.energyW || 0; valB = b.meta.energyW || 0; break;
					case "total": valA = a.totalPoints; valB = b.totalPoints; break;
					case "difficulty": valA = a.meta.difficulty || 0; valB = b.meta.difficulty || 0; break;
					case "priority": valA = a.meta.priority || 0; valB = b.meta.priority || 0; break;
					case "deadline": valA = a.meta.deadline || ""; valB = b.meta.deadline || ""; break;
				}

				if (valA < valB) return settings.questSortDir === "asc" ? -1 : 1;
				if (valA > valB) return settings.questSortDir === "asc" ? 1 : -1;
				return 0;
			});
		}

		// 4. Mode Logic
		const isFlattened = settings.questViewMode === "day" || settings.questSortBy !== "none";

		if (settings.questViewMode === "day") {
			// GROUP BY DAY
			const dayGroups: Record<string, typeof enrichedTasks> = {};
			for (const item of filtered) {
				const date = item.meta.deadline ? item.meta.deadline.split("T")[0] : "No Deadline";
				if (!dayGroups[date]) dayGroups[date] = [];
				dayGroups[date].push(item);
			}

			const sortedDays = Object.keys(dayGroups).sort((a, b) => {
				if (a === "No Deadline") return 1;
				if (b === "No Deadline") return -1;
				return a.localeCompare(b);
			});

			for (const date of sortedDays) {
				const groupContainer = el.createDiv({ cls: "life-rpg-quest-group" });
				groupContainer.createEl("h4", { text: `${date === "No Deadline" ? "📂" : "📅"} ${date}`, cls: "life-rpg-quest-file-name" });
				const list = groupContainer.createDiv({ cls: "life-rpg-quest-list" });
				for (const item of dayGroups[date]) {
					this.renderTaskCard(list, item.task, item.meta, settings, character, globalModifiers, true);
				}
			}
		} else {
			// GROUP BY FILE (Standard or Flattened if sorted)
			const fileGroups: Record<string, typeof enrichedTasks> = {};
			for (const item of filtered) {
				const path = item.task.filePath;
				if (!fileGroups[path]) fileGroups[path] = [];
				fileGroups[path].push(item);
			}

			for (const [filePath, items] of Object.entries(fileGroups)) {
				const fileName = filePath.split("/").pop()?.replace(".md", "") || "Unknown File";
				const groupContainer = el.createDiv({ cls: "life-rpg-quest-group" });
				groupContainer.createEl("h4", { text: `📄 ${fileName}`, cls: "life-rpg-quest-file-name" });
				const list = groupContainer.createDiv({ cls: "life-rpg-quest-list" });

				if (isFlattened) {
					for (const item of items) {
						this.renderTaskCard(list, item.task, item.meta, settings, character, globalModifiers, true);
					}
				} else {
					const tasks = items.map(i => i.task);
					const roots = tasks.filter(t => !t.parentId);
					const childrenMap: Record<string, TrackedTask[]> = {};
					for (const t of tasks) {
						if (t.parentId) {
							if (!childrenMap[t.parentId]) childrenMap[t.parentId] = [];
							childrenMap[t.parentId].push(t);
						}
					}
					
					const renderNode = (parentEl: HTMLElement, task: TrackedTask) => {
						const meta = items.find(i => i.task.id === task.id)?.meta || parseTaskMetadata(task.text);
						const subchildren = childrenMap[task.id] || [];
						this.renderTaskCard(parentEl, task, meta, settings, character, globalModifiers, false, subchildren, (container) => {
							for (const child of subchildren) renderNode(container, child);
						});
					};

					for (const root of roots) renderNode(list, root);
				}
			}
		}

		requestAnimationFrame(() => { 
			const scrollContainer = el.closest(".life-rpg-container") || el;
			scrollContainer.scrollTop = oldScrollTop; 
		});
	}

	private renderTaskCard(
		parentEl: HTMLElement, 
		task: TrackedTask, 
		metadata: TaskMetadata, 
		settings: PluginSettings, 
		character: CharacterState, 
		globalModifiers: ReturnType<typeof calculateGlobalModifiers>,
		flattened: boolean,
		children: TrackedTask[] = [],
		renderChildren?: (container: HTMLElement) => void
	): void {
		const taskText = getTaskText(task.text);
		const card = parentEl.createDiv({ cls: "life-rpg-quest-card" });
		if (!flattened && task.isSubtask) card.addClass("life-rpg-subtask");

		const headerRow = card.createDiv({ cls: "life-rpg-quest-header" });
		headerRow.style.cursor = "pointer";
		headerRow.addEventListener("click", async (e) => {
			e.stopPropagation();
			await this.app.workspace.openLinkText(task.filePath, task.filePath, true, { state: { line: task.line } });
		});

		const hasChildren = children.length > 0;
		let toggleBtn: HTMLElement | null = null;
		if (!flattened && hasChildren) {
			toggleBtn = headerRow.createEl("button", { cls: "life-rpg-subtask-toggle", text: "▶" });
		}

		headerRow.createEl("span", { text: taskText, cls: "life-rpg-quest-name" });

		const reward = calculateTaskReward(metadata, settings, character.attributes, globalModifiers, task.isSubtask);
		if (reward.xp > 0 || reward.gp > 0) {
			const infoRow = card.createDiv({ cls: "life-rpg-quest-info" });
			infoRow.createEl("span", { text: `+${reward.xp} XP, +${reward.gp} GP`, cls: "life-rpg-quest-reward" });
		}

		const badgesRow = card.createDiv({ cls: "life-rpg-quest-badges" });
		if (metadata.isHeading) {
			badgesRow.createEl("span", { text: "Heading", cls: "life-rpg-quest-badge life-rpg-badge-heading" });
		} else {
			let diffText = metadata.difficulty === Difficulty.Easy ? "Easy" :
						  metadata.difficulty === Difficulty.Challenging ? "Challenging" :
						  metadata.difficulty === Difficulty.Hardcore ? "Hardcore" :
						  metadata.difficulty === Difficulty.Madhouse ? "Madhouse" : "Passive";
			let diffClass = "life-rpg-badge-" + diffText.toLowerCase();
			badgesRow.createEl("span", { text: diffText, cls: `life-rpg-quest-badge ${diffClass}` });
		}
		
		if (metadata.priority !== undefined) {
			const prios = ["Lowest", "Low", "Medium", "High", "Highest"];
			const prioText = prios[metadata.priority] || "Priority";
			const prioClass = `life-rpg-badge-priority-${prioText.toLowerCase()}`;
			badgesRow.createEl("span", { text: prioText, cls: `life-rpg-quest-badge ${prioClass}` });
		}

		if (metadata.skillId) {
			const skill = this.stateManager.getSkill(metadata.skillId);
			if (skill) renderBadge(badgesRow, skill.name, skill.icon, "life-rpg-badge-skill");
		}

		if (metadata.deadline) {
			const dateStr = metadata.deadline.split("T")[0];
			badgesRow.createEl("span", { text: `📅 ${dateStr}`, cls: "life-rpg-quest-badge life-rpg-badge-deadline" });
		}

		const actionButtons = card.createDiv({ cls: "life-rpg-quest-actions" });
		const editBtn = actionButtons.createEl("button", { cls: "life-rpg-btn-icon", title: "Quest Settings" });
		setIcon(editBtn, "settings");
		editBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new QuestEditModal(this.app, task, this.stateManager, this.stateManager.getSkills(), () => {
				// Re-render the panel to show immediate changes
				this.stateManager.forceNotify();
			}).open();
		});

		if (metadata.deadline && metadata.deadline.split("T")[0] < new Date().toISOString().split("T")[0]) {
			card.addClass("life-rpg-quest-card-overdue");
		}

		if (!flattened && hasChildren && renderChildren) {
			const subtasksContainer = card.createDiv({ cls: "life-rpg-subtasks-container" });
			const stableId = task.questId || task.id;
			const isExpanded = settings.expandedQuestIds.includes(stableId);
			
			subtasksContainer.style.display = isExpanded ? "block" : "none";
			if (isExpanded) toggleBtn?.addClass("is-expanded");
			if (toggleBtn) {
				toggleBtn.innerText = isExpanded ? "▼" : "▶";
				toggleBtn.addEventListener("click", async (e) => {
					e.stopPropagation();
					const isCurrentlyHidden = subtasksContainer.style.display === "none";
					
					// Update local UI
					subtasksContainer.style.display = isCurrentlyHidden ? "block" : "none";
					toggleBtn!.innerText = isCurrentlyHidden ? "▼" : "▶";
					if (isCurrentlyHidden) toggleBtn!.addClass("is-expanded");
					else toggleBtn!.removeClass("is-expanded");

					// Persist to settings
					let newExpanded = [...settings.expandedQuestIds];
					if (isCurrentlyHidden) {
						if (!newExpanded.includes(stableId)) newExpanded.push(stableId);
					} else {
						newExpanded = newExpanded.filter(id => id !== stableId);
					}
					
					await this.stateManager.updateSettings({ expandedQuestIds: newExpanded });
				});
			}
			renderChildren(subtasksContainer);
		}
	}

	destroy(): void { this.containerEl.remove(); }
}
