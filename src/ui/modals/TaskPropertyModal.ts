// ============================================================================
// Life RPG — Task Property Modal
// Modal UI for setting difficulty, skill, and deadline on a task line.
// ============================================================================

import { App, Modal, Setting, DropdownComponent } from "obsidian";
import { type Skill, Difficulty } from "../../types";

export interface TaskPropertyResult {
	difficulty: Difficulty;
	skillId: string | null;
	deadline: string | null;
}

export class TaskPropertyModal extends Modal {
	private result: TaskPropertyResult;
	private skills: Skill[];
	private onSubmit: (result: TaskPropertyResult) => void;

	constructor(
		app: App,
		skills: Skill[],
		onSubmit: (result: TaskPropertyResult) => void
	) {
		super(app);
		this.skills = skills;
		this.onSubmit = onSubmit;
		this.result = {
			difficulty: Difficulty.Easy,
			skillId: null,
			deadline: null,
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("life-rpg-modal");

		contentEl.createEl("h2", { text: "⚔️ Task Properties" });
		contentEl.createEl("p", {
			text: "Set the difficulty, skill, and deadline for this task.",
			cls: "life-rpg-modal-desc",
		});

		// ---------------------------------------------------------------
		// Difficulty
		// ---------------------------------------------------------------
		new Setting(contentEl)
			.setName("Difficulty")
			.setDesc("Higher difficulty = more XP and GP")
			.addDropdown((dropdown: DropdownComponent) =>
				dropdown
					.addOption(Difficulty.Easy.toString(), "⭐ Easy (1x)")
					.addOption(Difficulty.Challenging.toString(), "⭐⭐ Challenging (2x)")
					.addOption(Difficulty.Hardcore.toString(), "⭐⭐⭐ Hardcore (3x)")
					.setValue(this.result.difficulty.toString())

					.onChange((value) => {
						this.result.difficulty = parseInt(value, 10) as Difficulty;
					})
			);

		// ---------------------------------------------------------------
		// Skill
		// ---------------------------------------------------------------
		new Setting(contentEl)
			.setName("Linked Skill")
			.setDesc("XP from this task also goes to the selected skill")
			.addDropdown((dropdown: DropdownComponent) => {
				dropdown.addOption("", "— None —");
				for (const skill of this.skills) {
					dropdown.addOption(
						skill.id,
						`${skill.icon} ${skill.name} (Lv.${skill.level})`
					);
				}
				dropdown.setValue("").onChange((value) => {
					this.result.skillId = value || null;
				});
			});

		// ---------------------------------------------------------------
		// Deadline
		// ---------------------------------------------------------------
		new Setting(contentEl)
			.setName("Deadline")
			.setDesc("Optional due date for this task")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.onChange((value) => {
						if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
							this.result.deadline = value;
						} else if (value === "") {
							this.result.deadline = null;
						}
					})
			);

		// ---------------------------------------------------------------
		// Submit
		// ---------------------------------------------------------------
		const buttonContainer = contentEl.createDiv({
			cls: "life-rpg-modal-buttons",
		});

		const submitBtn = buttonContainer.createEl("button", {
			text: "Apply Properties",
			cls: "mod-cta",
		});
		submitBtn.addEventListener("click", () => {
			this.onSubmit(this.result);
			this.close();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Build the inline metadata string to append to a task line.
 * Example output: " [difficulty: hard] [skill: Programming] [deadline: 2026-04-20]"
 */
export function buildMetadataString(result: TaskPropertyResult, skills: Skill[]): string {
	const parts: string[] = [];

	const diffLabel =
		result.difficulty === Difficulty.Hardcore
			? "hardcore"
			: result.difficulty === Difficulty.Challenging
				? "challenging"
				: "easy";

	parts.push(`[difficulty: ${diffLabel}]`);

	if (result.skillId) {
		const skill = skills.find((s) => s.id === result.skillId);
		if (skill) {
			parts.push(`[skill: ${skill.name}]`);
		}
	}

	if (result.deadline) {
		parts.push(`[deadline: ${result.deadline}]`);
	}

	return " " + parts.join(" ");
}
