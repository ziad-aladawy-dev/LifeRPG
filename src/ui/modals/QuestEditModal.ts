import { Modal, App, Setting, Notice } from "obsidian";
import { type TrackedTask, type TaskMetadata, Difficulty, type Skill } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { updateTaskInFile } from "../../engine/TaskEditor";

export class QuestEditModal extends Modal {
	private task: TrackedTask;
	private stateManager: StateManager;
	private metadata: TaskMetadata;
	private skills: Skill[];
	private onSave: () => void;

	constructor(app: App, task: TrackedTask, stateManager: StateManager, skills: Skill[], onSave: () => void) {
		super(app);
		this.task = task;
		this.stateManager = stateManager;
		this.skills = skills;
		this.onSave = onSave;

		// Initialize metadata from registry or legacy tags
		const existing = task.questId ? stateManager.getQuestMetadata(task.questId) : null;
		this.metadata = existing ? { ...existing } : {
			difficulty: Difficulty.Easy,
			skillId: null,
			deadline: null,
			startDate: null,
			endDate: null,
			includeTime: false
		};
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("life-rpg-premium-modal");
		contentEl.empty();

		contentEl.createEl("h2", { text: "📜 Quest Settings", cls: "life-rpg-modal-title" });
		contentEl.createEl("p", { 
			text: `Editing: ${this.task.text.replace(/\[id: [a-z0-9]+\]/g, "").replace(/^[\s]*[-*]\s\[[ xX]\]\s*/, "")}`, 
			cls: "life-rpg-modal-subtitle" 
		});

		const body = contentEl.createDiv({ cls: "life-rpg-modal-body" });

		// --- Heading Toggle ---
		new Setting(body)
			.setName("Is Complex Heading")
			.setDesc("If enabled, this task acts as a container with no inherent reward. Focus on subtasks instead.")
			.addToggle(toggle => toggle
				.setValue(!!this.metadata.isHeading)
				.onChange(v => {
					this.metadata.isHeading = v;
					this.onOpen(); // Re-render to show/hide other settings
				}));

		if (this.metadata.isHeading) {
			body.createEl("p", { 
				text: "⚠️ This task is marked as a Heading. Difficulty and Energy settings are disabled.", 
				cls: "life-rpg-modal-info-message" 
			});
		} else {
			// --- Difficulty ---
			new Setting(body)
				.setName("Difficulty")
				.setDesc("Higher difficulty grants more XP and GP, but deals more damage if missed.")
				.addDropdown(drop => drop
					.addOption(String(Difficulty.Passive), "Passive")
					.addOption(String(Difficulty.Easy), "Easy")
					.addOption(String(Difficulty.Challenging), "Challenging")
					.addOption(String(Difficulty.Hardcore), "Hardcore")
					.addOption(String(Difficulty.Madhouse), "Madhouse")
					.setValue(String(this.metadata.difficulty))
					.onChange(v => this.metadata.difficulty = Number(v) as Difficulty));

			// --- Bound Skill ---
			new Setting(body)
				.setName("Bound Skill")
				.setDesc("Associate this quest with a skill to earn specialized XP.")
				.addDropdown(drop => {
					drop.addOption("none", "None");
					for (const s of this.skills) {
						drop.addOption(s.id, `${s.icon} ${s.name}`);
					}
					drop.setValue(this.metadata.skillId || "none");
					drop.onChange(v => this.metadata.skillId = v === "none" ? null : v);
				});

			// --- Energy Load ---
			body.createEl("h3", { text: "🔋 Energy Load", cls: "life-rpg-section-title" });
			body.createEl("p", { 
				text: "Rate the drain on each battery from 1 (Low) to 5 (High). Total load determines rewards.", 
				cls: "life-rpg-setting-desc" 
			});

			new Setting(body)
				.setName("Mental (M)")
				.setDesc("Logic, problem-solving, and concentration.")
				.addSlider(slider => slider
					.setLimits(0, 5, 1)
					.setValue(this.metadata.energyM || 1)
					.setDynamicTooltip()
					.onChange(v => this.metadata.energyM = v));

			new Setting(body)
				.setName("Physical (P)")
				.setDesc("Movement, commuting, and sensory processing.")
				.addSlider(slider => slider
					.setLimits(0, 5, 1)
					.setValue(this.metadata.energyP || 1)
					.setDynamicTooltip()
					.onChange(v => this.metadata.energyP = v));

			new Setting(body)
				.setName("Willpower (W)")
				.setDesc("Resistance, boredom, or emotional dread.")
				.addSlider(slider => slider
					.setLimits(0, 5, 1)
					.setValue(this.metadata.energyW || 1)
					.setDynamicTooltip()
					.onChange(v => this.metadata.energyW = v));
		}

		// --- Date & Time ---
		body.createEl("h3", { text: "⏱️ Schedule", cls: "life-rpg-section-title" });

		const timeToggle = new Setting(body)
			.setName("Include Time")
			.setDesc("If enabled, deadlines will trigger at a specific hour/minute.")
			.addToggle(toggle => toggle
				.setValue(!!this.metadata.includeTime)
				.onChange(v => {
					this.metadata.includeTime = v;
					this.onOpen(); // Re-render to update input types
				}));

		const dateType = this.metadata.includeTime ? "datetime-local" : "date";

		new Setting(body)
			.setName("Start Date")
			.setDesc("When this quest becomes available.")
			.addText(text => {
				text.inputEl.type = dateType;
				text.setValue(this.formatDateForInput(this.metadata.startDate))
					.onChange(v => this.metadata.startDate = v ? new Date(v).toISOString() : null);
			});

		new Setting(body)
			.setName("End Date (Deadline)")
			.setDesc("The final deadline. Bosses will attack after this time.")
			.addText(text => {
				text.inputEl.type = dateType;
				text.setValue(this.formatDateForInput(this.metadata.endDate || this.metadata.deadline))
					.onChange(v => {
						const iso = v ? new Date(v).toISOString() : null;
						this.metadata.endDate = iso;
						this.metadata.deadline = iso; // Synced for safety
					});
			});

		// Footer
		const footer = contentEl.createDiv({ cls: "life-rpg-modal-footer" });
		const saveBtn = footer.createEl("button", { text: "Save Quest", cls: "life-rpg-btn life-rpg-btn-primary" });
		saveBtn.onclick = async () => {
			let qId = this.task.questId;
			if (!qId) {
				qId = this.stateManager.generateQuestId();
				const success = await updateTaskInFile(this.app, this.task, qId);
				if (!success) {
					new Notice("❌ Error: Could not add Sticky ID to file. Check if file is writable.");
					return;
				}
			}
			
			this.task.questId = qId; // Update locally for immediate UI response
			this.stateManager.registerQuestMetadata(qId, this.metadata);
			new Notice("✅ Quest updated and bound to file.");
			this.onSave();
			this.close();
		};

		const cancelBtn = footer.createEl("button", { text: "Cancel", cls: "life-rpg-btn" });
		cancelBtn.onclick = () => this.close();
	}

	private formatDateForInput(iso: string | null | undefined): string {
		if (!iso) return "";
		const date = new Date(iso);
		if (isNaN(date.getTime())) return "";
		
		const pad = (n: number) => String(n).padStart(2, '0');
		const y = date.getFullYear();
		const m = pad(date.getMonth() + 1);
		const d = pad(date.getDate());
		
		if (this.metadata.includeTime) {
			const hh = pad(date.getHours());
			const mm = pad(date.getMinutes());
			return `${y}-${m}-${d}T${hh}:${mm}`;
		}
		return `${y}-${m}-${d}`;
	}

	onClose() {
		this.contentEl.empty();
	}
}
