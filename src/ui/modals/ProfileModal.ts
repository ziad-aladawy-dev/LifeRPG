// ============================================================================
// Life RPG — Profile Modal
// Opens when clicking the character avatar in the Stats panel.
// Contains character name, class, avatar editing, sync, and rank progression.
// ============================================================================

import { Modal, App, Setting } from "obsidian";
import { type CharacterState } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { CHARACTER_CLASSES } from "../../engine/ClassSystem";
import { ImageCacheManager } from "../../utils/ImageCacheManager";

export class ProfileModal extends Modal {
	private stateManager: StateManager;

	constructor(app: App, stateManager: StateManager) {
		super(app);
		this.stateManager = stateManager;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("life-rpg-profile-modal");
		contentEl.empty();
		this.renderContent();
	}

	private renderContent(): void {
		const { contentEl } = this;
		const character = this.stateManager.getCharacter();

		// ── Header ──
		const header = contentEl.createDiv({ cls: "life-rpg-pm-header" });

		const avatarPreview = header.createDiv({ cls: "life-rpg-pm-avatar" });
		if (character.avatarUrl && (character.avatarUrl.startsWith("http") || character.avatarUrl.startsWith("data:image/"))) {
			const img = avatarPreview.createEl("img", {
				attr: { src: character.avatarUrl, alt: "Avatar" },
				cls: "life-rpg-pm-avatar-img"
			});

			// Resolve cached version for offline support
			if (character.avatarUrl.startsWith("http")) {
				ImageCacheManager.getInstance((this.stateManager as any).plugin.app)
					.getCachedUrl(character.avatarUrl)
					.then(cached => {
						if (cached) img.src = cached;
					});
			}
		} else {
			avatarPreview.setText(character.avatarUrl || "⚔️");
		}

		const titleGroup = header.createDiv({ cls: "life-rpg-pm-title-group" });
		titleGroup.createEl("h2", { text: character.name, cls: "life-rpg-pm-name" });
		const charClass = CHARACTER_CLASSES[character.classId] || Object.values(CHARACTER_CLASSES)[0];
		titleGroup.createEl("span", { text: `${charClass.name} • Level ${character.level}`, cls: "life-rpg-pm-subtitle" });

		// ── Configuration ──
		const body = contentEl.createDiv({ cls: "life-rpg-pm-body" });
		body.createEl("h3", { text: "⚙️ Character Setup", cls: "life-rpg-section-title" });

		new Setting(body)
			.setName("Name")
			.setDesc("Your character's title across all of Oathbound.")
			.addText(text => text
				.setValue(character.name)
				.onChange(v => {
					this.stateManager.updateCharacter({ name: v.trim() || "Hero" });
				}));

		new Setting(body)
			.setName("Class")
			.setDesc("Determines your rank progression path.")
			.addDropdown(drop => {
				for (const [id, def] of Object.entries(CHARACTER_CLASSES)) {
					drop.addOption(id, def.name);
				}
				drop.setValue(character.classId);
				drop.onChange(v => {
					this.stateManager.updateCharacter({ classId: v });
				});
			});

		new Setting(body)
			.setName("Avatar")
			.setDesc("Emoji or image URL for your character portrait.")
			.addText(text => text
				.setPlaceholder("⚔️ or https://...")
				.setValue(character.avatarUrl)
				.onChange(v => {
					this.stateManager.updateCharacter({ avatarUrl: v.trim() || "⚔️" });
				}));

		// ── Sync Button ──
		const syncRow = body.createDiv({ cls: "life-rpg-pm-sync-row" });
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
				// Re-render the modal with fresh data
				this.contentEl.empty();
				this.renderContent();
			}, 1500);
		});

		// ── Rank Progression ──
		body.createEl("h3", { text: "🏰 Rank Progression", cls: "life-rpg-section-title" });

		const updatedClass = CHARACTER_CLASSES[this.stateManager.getCharacter().classId] || Object.values(CHARACTER_CLASSES)[0];
		body.createEl("p", { text: updatedClass.description, cls: "life-rpg-class-desc" });

		const ranksList = body.createDiv({ cls: "life-rpg-ranks-list" });
		const ranksAscending = [...updatedClass.ranks].reverse();

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

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
