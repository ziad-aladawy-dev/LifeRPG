// ============================================================================
// Life RPG — Settings Tab
// Plugin settings UI in Obsidian's settings pane.
// ============================================================================

import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type LifeRpgPlugin from "../main";
import { Difficulty } from "../types";
import { ImageCacheManager } from "../utils/ImageCacheManager";

export class LifeRpgSettingsTab extends PluginSettingTab {
	plugin: LifeRpgPlugin;
	private previewEl: HTMLElement;

	constructor(app: App, plugin: LifeRpgPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ---------------------------------------------------------------
		// Header
		// ---------------------------------------------------------------
		containerEl.createEl("h1", { text: "⚔️ Life RPG Settings" });
		containerEl.createEl("p", {
			text: "Configure your RPG experience. Changes are saved automatically.",
			cls: "setting-item-description",
		});

		// ---------------------------------------------------------------
		// Character Profile
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Character Profile" });

		new Setting(containerEl)
			.setName("Character Name")
			.setDesc("What is your hero's name?")
			.addText((text) =>
				text
					.setPlaceholder("Hero")
					.setValue(this.plugin.stateManager.getCharacter().name)
					.onChange((value) => {
						const name = value.trim() || "Hero";
						this.plugin.stateManager.updateCharacter({ name });
					})
			);

		new Setting(containerEl)
			.setName("Character Class")
			.setDesc("Choose your RPG class archetype. This determines your title and rank progression.")
			.addDropdown((dropdown) => {
				dropdown.addOption("adventurer", "Adventurer (Generalist)");
				dropdown.addOption("warrior", "Warrior (Strength & Wisdom)");
				dropdown.addOption("mage", "Mage (Intelligence)");
				dropdown.addOption("rogue", "Rogue (Dexterity/Charisma)");

				dropdown.setValue(this.plugin.stateManager.getCharacter().classId || "adventurer");

				dropdown.onChange((value) => {
					this.plugin.stateManager.updateCharacter({ classId: value });
				});
			});

		new Setting(containerEl)
			.setName("Character Avatar")
			.setDesc("An emoji, an image URL (http...), or a data URI (data:image/...) for your character.")
			.addText((text) =>
				text
					.setPlaceholder("⚔️ or https://...")
					.setValue(this.plugin.stateManager.getCharacter().avatarUrl)
					.onChange((value) => {
						const avatarUrl = value.trim() || "⚔️";
						this.plugin.stateManager.updateCharacter({ avatarUrl });
					})
			);

		// ---------------------------------------------------------------
		// XP & GP Base Values
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Experience & Gold" });

		new Setting(containerEl)
			.setName("Base XP per task")
			.setDesc(
				"The base experience points awarded for completing a task (before difficulty multiplier)."
			)
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(
						this.plugin.stateManager.getSettings().baseXp.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.stateManager.updateSettings({
								baseXp: num,
							});
							this.refreshPreview();
						}
					})
			);

		new Setting(containerEl)
			.setName("Base GP per task")
			.setDesc(
				"The base gold awarded for completing a task (before difficulty multiplier)."
			)
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(
						this.plugin.stateManager.getSettings().baseGp.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.stateManager.updateSettings({
								baseGp: num,
							});
							this.refreshPreview();
						}
					})
			);

		new Setting(containerEl)
			.setName("Attribute XP Gain Ratio")
			.setDesc("The percentage of skill XP that also contributes to the governing attribute (e.g., 0.2 = 20%). Attributes level up slower than skills.")
			.addText((text) =>
				text
					.setPlaceholder("0.2")
					.setValue(
						this.plugin.stateManager.getSettings().skillToAttributeRatio?.toString() || "0.2"
					)
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num >= 0 && num <= 1.0) {
							this.plugin.stateManager.updateSettings({
								skillToAttributeRatio: num,
							});
						}
					})
			);

		// ---------------------------------------------------------------
		// Difficulty Multipliers
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Difficulty Multipliers" });

		const difficulties: { label: string; key: Difficulty }[] = [
			{ label: "Passive", key: Difficulty.Passive },
			{ label: "Easy", key: Difficulty.Easy },
			{ label: "Challenging", key: Difficulty.Challenging },
			{ label: "Hardcore", key: Difficulty.Hardcore },
			{ label: "Madhouse", key: Difficulty.Madhouse },
		];

		for (const diff of difficulties) {
			new Setting(containerEl)
				.setName(`${diff.label} multiplier`)
				.setDesc(
					`XP and GP are multiplied by this value for ${diff.label.toLowerCase()} tasks.`
				)
				.addText((text) =>
					text
						.setPlaceholder(diff.key.toString())
						.setValue(
							this.plugin.stateManager
								.getSettings()
								.difficultyMultipliers[diff.key].toString()
						)
						.onChange(async (value) => {
							const num = parseFloat(value);
							if (!isNaN(num) && num > 0) {
								const current =
									this.plugin.stateManager.getSettings()
										.difficultyMultipliers;
								await this.plugin.stateManager.updateSettings({
									difficultyMultipliers: {
										...current,
										[diff.key]: num,
									},
								});
								this.refreshPreview();
							}
						})
				);
		}

		// ---------------------------------------------------------------
		// Energy Reward Weights
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "⚡ Energy Reward Weights" });
		containerEl.createEl("p", { 
			text: "Configure how much each Energy Point (Mental/Physical/Willpower) contributes to your rewards. By default, 5 points total = 1.0x multiplier.",
			cls: "setting-item-description"
		});

		const weights = this.plugin.stateManager.getSettings().energyWeights;
		
		const categories: { label: string; key: keyof typeof weights }[] = [
			{ label: "Mental Weight", key: "mental" },
			{ label: "Physical Weight", key: "physical" },
			{ label: "Willpower Weight", key: "willpower" },
		];

		for (const cat of categories) {
			new Setting(containerEl)
				.setName(cat.label)
				.setDesc(`Impact of each ${cat.label.split(" ")[0]} point on the final multiplier.`)
				.addText((text) =>
					text
						.setPlaceholder("0.2")
						.setValue((weights[cat.key] || 0).toString())
						.onChange(async (value) => {
							const num = parseFloat(value);
							if (!isNaN(num) && num >= 0) {
								const currentWeights = this.plugin.stateManager.getSettings().energyWeights;
								await this.plugin.stateManager.updateSettings({
									energyWeights: {
										...currentWeights,
										[cat.key]: num,
									},
								});
								this.refreshPreview();
							}
						})
				);
		}

		// ---------------------------------------------------------------
		// Reward Calculation Preview
		// ---------------------------------------------------------------
		const previewSection = containerEl.createDiv({ cls: "life-rpg-reward-preview-container" });
		previewSection.createEl("h3", { text: "🧮 Reward Logic Preview" });
		this.previewEl = previewSection.createDiv({ cls: "life-rpg-reward-preview-card" });
		this.refreshPreview();

		// ---------------------------------------------------------------
		// HP Settings
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Health Points" });

		new Setting(containerEl)
			.setName("Starting Max HP")
			.setDesc("Maximum HP for a level 1 character.")
			.addText((text) =>
				text
					.setPlaceholder("100")
					.setValue(
						this.plugin.stateManager
							.getSettings()
							.defaultMaxHp.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.stateManager.updateSettings({
								defaultMaxHp: num,
							});
						}
					})
			);

		new Setting(containerEl)
			.setName("HP gained per level")
			.setDesc("How much Max HP increases with each level up.")
			.addText((text) =>
				text
					.setPlaceholder("5")
					.setValue(
						this.plugin.stateManager
							.getSettings()
							.hpPerLevel.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.stateManager.updateSettings({
								hpPerLevel: num,
							});
						}
					})
			);

		new Setting(containerEl)
			.setName("Daily HP regeneration")
			.setDesc("HP restored at the start of each new day.")
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(
						this.plugin.stateManager
							.getSettings()
							.dailyHpRegen.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.stateManager.updateSettings({
								dailyHpRegen: num,
							});
						}
					})
			);

		// ---------------------------------------------------------------
		// Boss Settings
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Boss System" });

		new Setting(containerEl)
			.setName("Enable boss fights")
			.setDesc(
				"When enabled, you can fight bosses by completing tasks."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.stateManager.getSettings().bossEnabled
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							bossEnabled: value,
						});
					})
			);

		new Setting(containerEl)
			.setName("Boss damage on missed deadline")
			.setDesc(
				"HP damage the boss deals when you miss a task deadline."
			)
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(
						this.plugin.stateManager
							.getSettings()
							.bossDamageOnMissedDeadline.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num >= 0) {
							this.plugin.stateManager.updateSettings({
								bossDamageOnMissedDeadline: num,
							});
						}
					})
			);

		// ---------------------------------------------------------------
		// General
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "General" });

		new Setting(containerEl)
			.setName("Enable task watcher")
			.setDesc(
				"Automatically detect when checkboxes are toggled in your notes and award XP/GP."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.stateManager.getSettings().enableTaskWatcher
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							enableTaskWatcher: value,
						});
						// Start/stop watcher dynamically
						if (value) {
							this.plugin.taskWatcher.start();
						} else {
							this.plugin.taskWatcher.stop();
						}
					})
			);
		
		new Setting(containerEl)
			.setName("Enable editor suggestions")
			.setDesc("Show autocomplete dropdown when typing '[' on a task line (e.g. [difficulty: hard]).")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.stateManager.getSettings().enableEditorSuggestions)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							enableEditorSuggestions: value,
						});
					})
			);

		new Setting(containerEl)
			.setName("Scan all files")
			.setDesc(
				"Monitor all markdown files for task completions. Disable to only track daily notes."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.stateManager.getSettings().scanAllFiles
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							scanAllFiles: value,
						});
					})
			);

		new Setting(containerEl)
			.setName("Daily notes folder")
			.setDesc(
				"Path to your daily notes folder (e.g. 'Daily Notes' or 'Journal'). " +
				"Leave empty to auto-detect from Daily Notes / Periodic Notes plugin settings."
			)
			.addText((text) =>
				text
					.setPlaceholder("Auto-detect")
					.setValue(
						this.plugin.stateManager.getSettings().dailyNotesFolder
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							dailyNotesFolder: value.trim(),
						});
					})
			);

		new Setting(containerEl)
			.setName("Daily note filename pattern")
			.setDesc(
				"Optional: Restrict tasks to files matching this pattern. " +
				"Use {{date}} for YYYY-MM-DD. Example: 'Journal-{{date}}'. " +
				"Only used when 'Scan all files' is disabled."
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g. {{date}}")
					.setValue(
						this.plugin.stateManager.getSettings().dailyNoteFormat
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							dailyNoteFormat: value.trim(),
						});
					})
			);

		new Setting(containerEl)
			.setName("Habit notes folder")
			.setDesc(
				"Path to the folder where habit-specific notes are stored (e.g. 'Atlas/Habits'). " +
				"These notes open when you click on a habit name."
			)
			.addText((text) =>
				text
					.setPlaceholder("Atlas/Habits")
					.setValue(
						this.plugin.stateManager.getSettings().habitNotesFolder
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							habitNotesFolder: value.trim(),
						});
					})
			);

		// ---------------------------------------------------------------
		// Notifications & Log
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Notifications & Log" });

		new Setting(containerEl)
			.setName("Show notifications")
			.setDesc(
				"Display popup notifications for XP gains, level ups, and other events."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						this.plugin.stateManager.getSettings().showNotifications
					)
					.onChange(async (value) => {
						this.plugin.stateManager.updateSettings({
							showNotifications: value,
						});
					})
			);

		new Setting(containerEl)
			.setName("Max log entries")
			.setDesc(
				"Maximum number of entries to keep in the activity log."
			)
			.addText((text) =>
				text
					.setPlaceholder("500")
					.setValue(
						this.plugin.stateManager
							.getSettings()
							.maxLogEntries.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.stateManager.updateSettings({
								maxLogEntries: num,
							});
						}
					})
			);

		// ---------------------------------------------------------------
		// Image Cache
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "🖼️ Image Cache" });

		new Setting(containerEl)
			.setName("Download and cache portal images")
			.setDesc("Automatically download external image URLs for offline use. Always enabled for best experience.")
			.addToggle((toggle) => toggle.setValue(true).setDisabled(true));

		new Setting(containerEl)
			.setName("Cache size cap (MB)")
			.setDesc("Maximum space allowed for cached images. Oldest images are deleted when full.")
			.addText((text) =>
				text
					.setPlaceholder("100")
					.setValue(
						this.plugin.stateManager.getSettings().imageCacheSizeCap.toString()
					)
					.onChange(async (value) => {
						const num = parseInt(value, 10);
						if (!isNaN(num) && num > 0) {
							this.plugin.stateManager.updateSettings({
								imageCacheSizeCap: num,
							});
						}
					})
			);

		const cacheSetting = new Setting(containerEl)
			.setName("Clear image cache")
			.setDesc("Checking storage usage...")
			.addButton((btn) =>
				btn
					.setButtonText("Clear Cache")
					.setWarning()
					.onClick(async () => {
						const confirmed = confirm("Are you sure you want to delete all cached images? They will be re-downloaded if you visit the store/profile while online.");
						if (confirmed) {
							await ImageCacheManager.getInstance(this.app).clearCache();
							new Notice("Image cache cleared.");
							this.display(); // Refresh
						}
					})
			);

		// Update cache size display
		ImageCacheManager.getInstance(this.app).getCacheSizeMB().then(size => {
			cacheSetting.setDesc(`Current usage: ${size} MB. Click to delete all cached image files.`);
		});

		// ---------------------------------------------------------------
		// Danger Zone
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "⚠️ Danger Zone" });

		new Setting(containerEl)
			.setName("Reset all progress")
			.setDesc(
				"WARNING: This will erase all your character progress, skills, habits, and rewards. This cannot be undone."
			)
			.addButton((btn) =>
				btn
					.setButtonText("Reset Everything")
					.setWarning()
					.onClick(async () => {
						const confirmed = confirm(
							"Are you sure you want to reset ALL progress? This cannot be undone!"
						);
						if (confirmed) {
							await this.plugin.stateManager.resetState();
						}
					})
			);
	}

	private refreshPreview(): void {
		if (!this.previewEl) return;
		this.previewEl.empty();
		
		const settings = this.plugin.stateManager.getSettings();
		const weights = settings.energyWeights || { mental: 0.2, physical: 0.2, willpower: 0.2 };
		
		const examplePoints = 5;
		const exampleDiff = Difficulty.Hardcore;
		const diffMult = settings.difficultyMultipliers[exampleDiff] || 1;
		
		// Calculate energy for an example of 5 points in Mental
		const energyMult = examplePoints * weights.mental;
		const totalMult = diffMult * energyMult;
		
		const xp = Math.round(settings.baseXp * totalMult);
		const gp = Math.round(settings.baseGp * totalMult);

		this.previewEl.createEl("p", { 
			text: "Formula: Base × Difficulty × ((M × MW) + (P × PW) + (W × WW))",
			cls: "preview-formula"
		});

		const exampleRow = this.previewEl.createDiv({ cls: "preview-example" });
		exampleRow.createEl("div", { 
			text: `Example: ${settings.baseXp} XP Base × ${diffMult}x (Hardcore) × (${examplePoints} Mental pts × ${weights.mental})` 
		});
		
		const resultRow = this.previewEl.createDiv({ cls: "preview-result" });
		resultRow.createEl("span", { text: "Final Reward: ", cls: "result-label" });
		resultRow.createEl("span", { text: `✨ ${xp} XP / 💰 ${gp} GP`, cls: "result-value" });
		
		if (totalMult < 1) {
			this.previewEl.createEl("small", { 
				text: "⚠️ Note: Current weights result in a reward reduction for this example.",
				cls: "preview-warning"
			});
		}
	}
}
