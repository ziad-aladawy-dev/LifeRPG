// ============================================================================
// Life RPG — Settings Tab
// Plugin settings UI in Obsidian's settings pane.
// ============================================================================

import { App, PluginSettingTab, Setting } from "obsidian";
import type LifeRpgPlugin from "../main";
import { Difficulty } from "../types";

export class LifeRpgSettingsTab extends PluginSettingTab {
	plugin: LifeRpgPlugin;

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
						}
					})
			);

		// ---------------------------------------------------------------
		// Difficulty Multipliers
		// ---------------------------------------------------------------
		containerEl.createEl("h2", { text: "Difficulty Multipliers" });

		const difficulties: { label: string; key: Difficulty }[] = [
			{ label: "Easy", key: Difficulty.Easy },
			{ label: "Medium", key: Difficulty.Medium },
			{ label: "Hard", key: Difficulty.Hard },
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
								this.plugin.stateManager.updateSettings({
									difficultyMultipliers: {
										...current,
										[diff.key]: num,
									},
								});
							}
						})
				);
		}

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
}
