import { setIcon } from "obsidian";
import { type CharacterState } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { CHARACTER_CLASSES } from "../../engine/ClassSystem";

export class ProfilePanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-profile-panel" });
		this.stateManager = stateManager;
	}

	render(character: CharacterState): void {
		const el = this.containerEl;
		el.empty();

		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "Profile Setup" });

		// Profile Edit Section
		const form = el.createDiv({ cls: "life-rpg-form" });

		const avatarPreview = form.createDiv({ cls: "life-rpg-profile-avatar-preview" });
		if (character.avatarUrl && (character.avatarUrl.startsWith("http") || character.avatarUrl.startsWith("data:image/"))) {
			avatarPreview.createEl("img", {
				attr: { src: character.avatarUrl, alt: "Avatar" },
				cls: "life-rpg-char-avatar-img"
			});
		} else {
			avatarPreview.setText(character.avatarUrl || "⚔️");
		}

		// Name
		const nameRow = form.createDiv({ cls: "life-rpg-form-row" });
		nameRow.createEl("label", { text: "Name:" });
		const nameInput = nameRow.createEl("input", {
			type: "text",
			cls: "life-rpg-input",
			value: character.name,
		});
		nameInput.addEventListener("keydown", (e) => e.stopPropagation());
		nameInput.addEventListener("change", () => {
			const name = nameInput.value.trim() || "Hero";
			this.stateManager.updateCharacter({ name });
		});

		// Class Selection
		const classRow = form.createDiv({ cls: "life-rpg-form-row" });
		classRow.createEl("label", { text: "Class:" });
		const classSelect = classRow.createEl("select", { cls: "life-rpg-select" });
		classSelect.addEventListener("keydown", (e) => e.stopPropagation());

		for (const [id, def] of Object.entries(CHARACTER_CLASSES)) {
			const option = classSelect.createEl("option", {
				value: id,
				text: def.name,
			});
			if (character.classId === id) {
				option.selected = true;
			}
		}

		classSelect.addEventListener("change", () => {
			this.stateManager.updateCharacter({ classId: classSelect.value });
		});

		// Avatar URL
		const avatarRow = form.createDiv({ cls: "life-rpg-form-row" });
		avatarRow.createEl("label", { text: "Avatar:" });
		const avatarInput = avatarRow.createEl("input", {
			type: "text",
			cls: "life-rpg-input",
			value: character.avatarUrl,
			placeholder: "emoji or http://...",
		});
		avatarInput.addEventListener("keydown", (e) => e.stopPropagation());
		avatarInput.addEventListener("change", () => {
			const avatarUrl = avatarInput.value.trim() || "⚔️";
			this.stateManager.updateCharacter({ avatarUrl });
		});

		// Manual Sync Button
		const syncRow = el.createDiv({ cls: "life-rpg-form-row", attr: { style: "justify-content: center; margin: 16px 0;" } });
		const syncBtn = syncRow.createEl("button", {
			text: "🔄 Sync from File",
			cls: "life-rpg-btn life-rpg-btn-subtle life-rpg-btn-small",
		});
		syncBtn.title = "Force reload data from data.json (useful if PC and Mobile are out of sync)";
		syncBtn.addEventListener("click", async () => {
			syncBtn.setText("⏳ Syncing...");
			syncBtn.disabled = true;
			await this.stateManager.load();
			this.stateManager.forceNotify();
			syncBtn.setText("✅ Synced!");
			setTimeout(() => {
				syncBtn.setText("🔄 Sync from File");
				syncBtn.disabled = false;
				this.render(this.stateManager.getState().character);
			}, 1500);
		});

		el.createEl("hr", { cls: "life-rpg-divider" });

		// Rank Progression Tree
		const ranksSection = el.createDiv({ cls: "life-rpg-ranks-section" });
		ranksSection.createEl("h4", { text: "Rank Progression" });

		const charClass = CHARACTER_CLASSES[character.classId] || Object.values(CHARACTER_CLASSES)[0];

		ranksSection.createEl("p", { text: charClass.description, cls: "life-rpg-class-desc" });

		const ranksList = ranksSection.createDiv({ cls: "life-rpg-ranks-list" });

		// Sort ascending for timeline view (reverse of the object definition)
		const ranksAscending = [...charClass.ranks].reverse();

		// Determine the *highest* rank achieved
		// Note: ranksAscending goes from level 1 up to level 100.
		let highestRankAchievedIdx = -1;
		for (let i = 0; i < ranksAscending.length; i++) {
			if (character.level >= ranksAscending[i].levelThreshold) {
				highestRankAchievedIdx = i;
			}
		}

		for (let i = ranksAscending.length - 1; i >= 0; i--) {
			const rank = ranksAscending[i];
			const isAchieved = i <= highestRankAchievedIdx;
			const isCurrent = i === highestRankAchievedIdx;

			let clsStr = "life-rpg-rank-item";
			if (isCurrent) clsStr += " life-rpg-rank-current";
			else if (isAchieved) clsStr += " life-rpg-rank-achieved";
			else clsStr += " life-rpg-rank-locked";

			const item = ranksList.createDiv({ cls: clsStr });

			const iconContainer = item.createDiv({ cls: "life-rpg-rank-icon-container" });
			const iconEl = iconContainer.createEl("span", { cls: "life-rpg-rank-icon" });
			if (isCurrent) {
				iconEl.setText("⭐");
			} else if (isAchieved) {
				iconEl.setText("✅");
			} else {
				iconEl.setText("🔒");
			}

			const content = item.createDiv({ cls: "life-rpg-rank-content" });
			content.createEl("div", { text: `Level ${rank.levelThreshold}`, cls: "life-rpg-rank-level" });
			content.createEl("div", { text: rank.title, cls: "life-rpg-rank-title" });
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
