// ============================================================================
// Life RPG — Quests Panel
// Displays all currently tracked active (unchecked) tasks.
// ============================================================================

import { setIcon } from "obsidian";
import { Difficulty, TaskPriority, type TrackedTask, type PluginSettings, type CharacterState, type CharacterAttributes, type TaskMetadata } from "../../types";
import { parseTaskMetadata, getTaskText } from "../../utils/parser";
import { calculateTaskReward, calculateGlobalModifiers } from "../../engine/GameEngine";
import { type StateManager } from "../../state/StateManager";
import { QuestEditModal } from "../modals/QuestEditModal";
import { renderBadge } from "../../utils/uiUtils";

export class QuestsPanel {
	private app: any;
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, app: any, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-quests-panel" });
		this.app = app;
		this.stateManager = stateManager;
	}

	render(activeTasks: TrackedTask[], settings: PluginSettings, character: CharacterState, globalModifiers: ReturnType<typeof calculateGlobalModifiers>): void {
		const el = this.containerEl;
		el.empty();

		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "📜 Active Quests" });

		if (activeTasks.length === 0) {
			el.createDiv({
				cls: "life-rpg-empty-state",
				text: "You have no active quests! Add a task to your daily notes with '- [ ] Task name' to begin.",
			});
			return;
		}

		// Group tasks by file path
		const grouped: Record<string, TrackedTask[]> = {};
		for (const t of activeTasks) {
			if (!grouped[t.filePath]) {
				grouped[t.filePath] = [];
			}
			grouped[t.filePath].push(t);
		}

		for (const [filePath, tasks] of Object.entries(grouped)) {
			// Extract file name
			const fileName = filePath.split("/").pop()?.replace(".md", "") || "Unknown File";
			
			const groupContainer = el.createDiv({ cls: "life-rpg-quest-group" });
			groupContainer.createEl("h4", { text: `📄 ${fileName}`, cls: "life-rpg-quest-file-name" });
			
			const list = groupContainer.createDiv({ cls: "life-rpg-quest-list" });
			
			// Build relational tree mapping for tasks in this file
			const roots: TrackedTask[] = [];
			const childrenMap: Record<string, TrackedTask[]> = {};

			for (const t of tasks) {
				if (!t.parentId) {
					roots.push(t);
				} else {
					if (!childrenMap[t.parentId]) childrenMap[t.parentId] = [];
					childrenMap[t.parentId].push(t);
				}
			}

			const renderTaskNode = (parentEl: HTMLElement, task: TrackedTask) => {
				// 1. Get Metadata (Registry Priority)
				let metadata = parseTaskMetadata(task.text);
				if (task.questId) {
					const registeredMeta = this.stateManager.getQuestMetadata(task.questId);
					if (registeredMeta) {
						metadata = { ...metadata, ...registeredMeta };
					}
				}

				const taskText = getTaskText(task.text);

				const card = parentEl.createDiv({ cls: "life-rpg-quest-card" });
				if (task.isSubtask) {
					card.addClass("life-rpg-subtask");
				}

				const headerRow = card.createDiv({ cls: "life-rpg-quest-header" });
				headerRow.style.cursor = "pointer";
				headerRow.title = "Click to jump to file";
				headerRow.addEventListener("click", async (e) => {
					e.stopPropagation();
					// Use obsidian app to open the file at the specific line
					await this.app.workspace.openLinkText(task.filePath, task.filePath, true, {
						state: { line: task.line }
					});
				});

				// Display logic for subtask visibility toggle
				const children = childrenMap[task.id] || [];
				const hasChildren = children.length > 0;
				let subtasksContainer: HTMLElement | null = null;
				let toggleBtn: HTMLElement | null = null;

				if (hasChildren) {
					toggleBtn = headerRow.createEl("button", { cls: "life-rpg-subtask-toggle", text: "▶" });
				}

				// Display name
				const nameEl = headerRow.createEl("span", { text: taskText, cls: "life-rpg-quest-name" });

				// Rewards Info Row (Beautifully written under title)
				let parentIsHeading = false;
				if (task.isSubtask && task.parentId) {
					const parent = tasks.find(t => t.id === task.parentId);
					if (parent && parent.questId) {
						parentIsHeading = this.stateManager.getQuestMetadata(parent.questId)?.isHeading || false;
					}
				}
				const reward = calculateTaskReward(metadata, settings, character.attributes, globalModifiers, task.isSubtask, parentIsHeading);
				
				if (reward.xp > 0 || reward.gp > 0) {
					const infoRow = card.createDiv({ cls: "life-rpg-quest-info" });
					infoRow.createEl("span", { 
						text: `+${reward.xp} XP, +${reward.gp} GP`, 
						cls: "life-rpg-quest-reward" 
					});
				}

				const badgesRow = card.createDiv({ cls: "life-rpg-quest-badges" });
				
				if (metadata.isHeading) {
					badgesRow.createEl("span", { text: "Heading", cls: "life-rpg-quest-badge life-rpg-badge-heading" });
				} else {
					// Difficulty badge
					let diffClass = "life-rpg-badge-passive";
					let diffText = "Passive";
					switch (metadata.difficulty) {
						case Difficulty.Easy: diffClass = "life-rpg-badge-easy"; diffText = "Easy"; break;
						case Difficulty.Challenging: diffClass = "life-rpg-badge-challenging"; diffText = "Challenging"; break;
						case Difficulty.Hardcore: diffClass = "life-rpg-badge-hardcore"; diffText = "Hardcore"; break;
						case Difficulty.Madhouse: diffClass = "life-rpg-badge-madhouse"; diffText = "Madhouse"; break;
					}
					
					badgesRow.createEl("span", { text: diffText, cls: `life-rpg-quest-badge ${diffClass}` });
				}
				
				// Priority Badge (Obsidian Tasks compatibility)
				if (metadata.priority !== undefined) {
					let prioText = "";
					let prioClass = "";
					switch(metadata.priority) {
						case TaskPriority.Highest: prioText = "Highest Priority"; prioClass = "life-rpg-badge-priority-highest"; break;
						case TaskPriority.High: prioText = "High Priority"; prioClass = "life-rpg-badge-priority-high"; break;
						case TaskPriority.Medium: prioText = "Medium Priority"; prioClass = "life-rpg-badge-priority-medium"; break;
						case TaskPriority.Low: prioText = "Low Priority"; prioClass = "life-rpg-badge-priority-low"; break;
						case TaskPriority.Lowest: prioText = "Lowest Priority"; prioClass = "life-rpg-badge-priority-lowest"; break;
					}
					if (prioClass) {
						badgesRow.createEl("span", { text: prioText, cls: `life-rpg-quest-badge ${prioClass}` });
					}
				}
				
				if (metadata.skillId) {
					const skill = this.stateManager.getSkill(metadata.skillId);
					if (skill) {
						renderBadge(badgesRow, skill.name, skill.icon, "life-rpg-badge-skill");
					} else {
						renderBadge(badgesRow, metadata.skillId, undefined, "life-rpg-badge-skill");
					}
				}
				


				// --- Action Buttons ---
				const actionButtons = card.createDiv({ cls: "life-rpg-quest-actions" });
				
				const editBtn = actionButtons.createEl("button", { 
					cls: "life-rpg-btn-icon",
					title: "Edit Quest Settings"
				});
				setIcon(editBtn, "settings");
				editBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					new QuestEditModal(
						this.app, 
						task, 
						this.stateManager, 
						this.stateManager.getSkills(),
						() => {
							// Refresh will happen via state manager notify
						}
					).open();
				});

				// Date Badges (Range & Time support)
				if (metadata.startDate || metadata.endDate || metadata.deadline) {
					const startStr = metadata.startDate;
					const endStr = metadata.endDate || metadata.deadline;
					const includeTime = !!metadata.includeTime;

					const format = (iso: string) => {
						const d = new Date(iso);
						const ds = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
						if (!includeTime) return ds;
						const ts = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
						return `${ds} ${ts}`;
					};

					const now = new Date();
					const today = new Date().toISOString().split("T")[0];
					let dateText = "";
					let isOverdue = false;

					if (startStr && endStr) {
						dateText = `${format(startStr)} - ${format(endStr)}`;
					} else if (endStr) {
						dateText = `Due: ${format(endStr)}`;
					} else if (startStr) {
						dateText = `Starts: ${format(startStr)}`;
					}

					if (endStr) {
						const dlDateObj = new Date(endStr);
						if (includeTime) {
							isOverdue = now.getTime() > dlDateObj.getTime();
						} else {
							const dlDay = endStr.split("T")[0];
							isOverdue = dlDay < today;
						}
					}

					if (isOverdue) {
						card.addClass("life-rpg-quest-card-overdue");
						badgesRow.createEl("span", { text: `🚨 OVERDUE: ${dateText}`, cls: `life-rpg-quest-badge life-rpg-badge-overdue` });
					} else {
						badgesRow.createEl("span", { text: `📅 ${dateText}`, cls: `life-rpg-quest-badge life-rpg-badge-deadline` });
					}
				}

				// If it has children, render them wrapped below
				if (hasChildren) {
					subtasksContainer = parentEl.createDiv({ cls: "life-rpg-subtasks-container" });
					subtasksContainer.style.display = "none";

					toggleBtn?.addEventListener("click", (e) => {
						e.stopPropagation();
						if (!subtasksContainer) return;
						const isHidden = subtasksContainer.style.display === "none";
						subtasksContainer.style.display = isHidden ? "block" : "none";
						if (toggleBtn) {
							toggleBtn.innerText = isHidden ? "▼" : "▶";
						}
					});

					for (const child of children) {
						renderTaskNode(subtasksContainer, child);
					}
				}
			};

			for (const root of roots) {
				renderTaskNode(list, root);
			}
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
