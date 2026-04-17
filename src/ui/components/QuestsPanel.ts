// ============================================================================
// Life RPG — Quests Panel
// Displays all currently tracked active (unchecked) tasks.
// ============================================================================

import { type TrackedTask, type PluginSettings, type CharacterState, Difficulty } from "../../types";
import { parseTaskMetadata, getTaskText } from "../../utils/parser";
import { calculateTaskReward } from "../../engine/GameEngine";

export class QuestsPanel {
	private containerEl: HTMLElement;

	constructor(parentEl: HTMLElement) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-quests-panel" });
	}

	render(activeTasks: TrackedTask[], settings: PluginSettings, character: CharacterState): void {
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
				const metadata = parseTaskMetadata(task.text);
				const taskText = getTaskText(task.text);

				const card = parentEl.createDiv({ cls: "life-rpg-quest-card" });
				if (task.isSubtask) {
					card.addClass("life-rpg-subtask");
				}

				const headerRow = card.createDiv({ cls: "life-rpg-quest-header" });

				// Display logic for subtask visibility toggle
				const children = childrenMap[task.id] || [];
				const hasChildren = children.length > 0;
				let subtasksContainer: HTMLElement | null = null;
				let toggleBtn: HTMLElement | null = null;

				if (hasChildren) {
					toggleBtn = headerRow.createEl("button", { cls: "life-rpg-subtask-toggle", text: "▶" });
				}

				// Highlight text containing #tags
				const nameEl = headerRow.createEl("span", { cls: "life-rpg-quest-name" });
				nameEl.innerHTML = taskText.replace(
					/(^|\s)(#[a-zA-Z0-9_\-]+)/g, 
					'$1<span class="life-rpg-tag">$2</span>'
				);

				const badgesRow = card.createDiv({ cls: "life-rpg-quest-badges" });
				
				// Difficulty badge
				let diffClass = "life-rpg-badge-easy";
				let diffText = "Easy";
				if (metadata.difficulty === Difficulty.Medium) {
					diffClass = "life-rpg-badge-medium";
					diffText = "Medium";
				} else if (metadata.difficulty === Difficulty.Hard) {
					diffClass = "life-rpg-badge-hard";
					diffText = "Hard";
				}
				
				badgesRow.createEl("span", { text: diffText, cls: `life-rpg-quest-badge ${diffClass}` });
				
				if (metadata.skillId) {
					badgesRow.createEl("span", { text: `★ ${metadata.skillId}`, cls: `life-rpg-quest-badge life-rpg-badge-skill` });
				}
				
				// Reward Preview
				const reward = calculateTaskReward(metadata.difficulty, settings, character.attributes, task.isSubtask);
				badgesRow.createEl("span", { text: `+${reward.xp} XP`, cls: `life-rpg-quest-badge life-rpg-habit-reward` });
				badgesRow.createEl("span", { text: `+${reward.gp} GP`, cls: `life-rpg-quest-badge life-rpg-habit-reward` });

				if (metadata.deadline) {
					const dlDateObj = new Date(metadata.deadline);
					const dlDate = dlDateObj.toLocaleDateString(undefined, {month:'short', day:'numeric'});
					
					const today = new Date().toISOString().split("T")[0];
					const isOverdue = metadata.deadline < today;

					if (isOverdue) {
						card.addClass("life-rpg-quest-card-overdue");
						badgesRow.createEl("span", { text: `🚨 OVERDUE: ${dlDate}`, cls: `life-rpg-quest-badge life-rpg-badge-overdue` });
					} else {
						badgesRow.createEl("span", { text: `📅 ${dlDate}`, cls: `life-rpg-quest-badge life-rpg-badge-deadline` });
					}
				}

				// If it has children, render them wrapped below
				if (hasChildren) {
					subtasksContainer = parentEl.createDiv({ cls: "life-rpg-subtasks-container" });
					subtasksContainer.style.display = "none";

					toggleBtn?.addEventListener("click", () => {
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
