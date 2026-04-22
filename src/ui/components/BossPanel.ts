// ============================================================================
// Life RPG — Boss Panel
// Displays active boss fights, dungeon progress, and boss selection.
// ============================================================================

import { setIcon } from "obsidian";
import { type Boss, type Dungeon } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { formatNumber, percentage } from "../../utils/formatter";
import { renderIcon } from "../../utils/uiUtils";
import {
	createBossFromTemplate,
	createDungeonFromTemplate,
	getDungeonProgress,
	getCurrentDungeonStage,
} from "../../engine/BossEngine";
import { BOSS_TEMPLATES, DUNGEON_TEMPLATES } from "../../constants";

export class BossPanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-boss-panel" });
		this.stateManager = stateManager;
	}

	render(
		activeBoss: Boss | null,
		activeDungeon: Dungeon | null,
		totalBossesDefeated: number,
		totalDungeonsCleared: number
	): void {
		const el = this.containerEl;
		el.empty();

		const header = el.createDiv({ cls: "life-rpg-panel-header" });
		header.createEl("h3", { text: "💀 Bosses & Dungeons" });

		// Stats summary
		const stats = el.createDiv({ cls: "life-rpg-boss-stats" });
		stats.createEl("span", {
			text: `🏆 ${totalBossesDefeated} bosses defeated`,
			cls: "life-rpg-boss-stat",
		});
		stats.createEl("span", {
			text: `🏰 ${totalDungeonsCleared} dungeons cleared`,
			cls: "life-rpg-boss-stat",
		});

		// Active Boss
		if (activeBoss) {
			this.renderActiveBoss(el, activeBoss);
		} else {
			this.renderBossSelection(el);
		}

		// Dungeon section
		el.createEl("hr", { cls: "life-rpg-divider" });
		if (activeDungeon && activeDungeon.active) {
			this.renderActiveDungeon(el, activeDungeon);
		} else {
			this.renderDungeonSelection(el);
		}
	}

	private renderActiveBoss(parent: HTMLElement, boss: Boss): void {
		const section = parent.createDiv({ cls: "life-rpg-active-boss" });

		const hpPercent = (boss.hp / boss.maxHp) * 100;
		const rageClass = hpPercent < 25 ? "boss-is-critical" : hpPercent < 50 ? "boss-is-enraged" : "";
		const bossCard = section.createDiv({ cls: `life-rpg-boss-card ${rageClass}` });

		// Boss header
		const bossHeader = bossCard.createDiv({ cls: "life-rpg-boss-header" });
		const iconEl = bossHeader.createEl("span", {
			cls: "life-rpg-boss-icon",
		});
		renderIcon(iconEl, boss.icon);

		const bossInfo = bossHeader.createDiv({ cls: "life-rpg-boss-info" });
		bossInfo.createEl("h4", { text: boss.name, cls: "life-rpg-boss-name" });
		bossInfo.createEl("p", {
			text: boss.flavor,
			cls: "life-rpg-boss-flavor",
		});

		// Enrage Timer
		const settings = this.stateManager.getSettings();
		const enrageHours = settings.bossEnrageHours ?? 48;
		const elapsedMs = Date.now() - new Date(boss.startedAt).getTime();
		const elapsedHours = elapsedMs / (1000 * 60 * 60);
		const isEnraged = elapsedHours >= enrageHours;
		const hoursLeft = Math.max(0, Math.ceil(enrageHours - elapsedHours));

		const timerEl = bossCard.createDiv({ cls: `life-rpg-boss-timer ${isEnraged ? "is-enraged" : ""}` });
		if (isEnraged) {
			timerEl.setText("💢 ENRAGED! Boss attack power increased by 50%!");
		} else {
			timerEl.setText(`⏱️ Enrage in: ${hoursLeft}h — Defeat the boss before time runs out!`);
		}

		// Boss HP bar
		const hpSection = bossCard.createDiv({ cls: "life-rpg-stat-section" });
		const hpHeader = hpSection.createDiv({ cls: "life-rpg-stat-header" });
		hpHeader.createEl("span", {
			text: "Boss HP",
			cls: "life-rpg-stat-label",
		});
		hpHeader.createEl("span", {
			text: `${formatNumber(boss.hp)} / ${formatNumber(boss.maxHp)}`,
			cls: "life-rpg-stat-value",
		});

		const barContainer = hpSection.createDiv({
			cls: "life-rpg-bar-container",
		});
		const bar = barContainer.createDiv({
			cls: "life-rpg-bar life-rpg-bar-boss",
		});
		bar.style.width = `${percentage(boss.hp, boss.maxHp)}%`;

		// Boss Abilities
		if (boss.abilities && boss.abilities.length > 0) {
			const abilitiesDiv = bossCard.createDiv({ cls: "life-rpg-boss-abilities" });
			for (const ability of boss.abilities) {
				const isActive = hpPercent <= ability.triggerHpPercent;
				const abilityEl = abilitiesDiv.createDiv({ cls: `life-rpg-boss-ability ${isActive ? "is-active" : ""}` });
				const effectIcon = ability.effect === "enrage" ? "💢" : ability.effect === "regen" ? "💚" : ability.effect === "dodge" ? "💨" : "⚡";
				abilityEl.setText(`${effectIcon} ${ability.name}: ${ability.description} ${isActive ? "[ACTIVE]" : `[< ${ability.triggerHpPercent}% HP]`}`);
			}
		}

		// Loot Table Preview
		if (boss.lootTable && boss.lootTable.length > 0) {
			const lootDiv = bossCard.createDiv({ cls: "life-rpg-boss-loot" });
			for (const loot of boss.lootTable) {
				lootDiv.createDiv({ cls: "life-rpg-boss-loot-item", text: `🎁 ${loot.name} (${Math.round(loot.chance * 100)}%)` });
			}
		}

		// Rewards preview
		const rewards = bossCard.createDiv({ cls: "life-rpg-boss-rewards" });
		rewards.createEl("span", { text: `🏆 Defeat reward: +${boss.xpReward} XP, +${boss.gpReward} GP` });

		// Abandon button
		const abandonBtn = bossCard.createEl("button", {
			text: "🏳️ Abandon Fight",
			cls: "life-rpg-btn life-rpg-btn-danger life-rpg-btn-small",
		});
		abandonBtn.addEventListener("click", () => {
			if (confirm("Abandon this boss fight? Progress will be lost.")) {
				this.stateManager.setActiveBoss(null);
			}
		});
	}

	private renderBossSelection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "life-rpg-boss-select" });
		section.createEl("h4", { text: "🐉 Choose a Boss to Fight" });
		section.createEl("p", {
			text: "Complete tasks to deal damage. Each task's XP = damage dealt!",
			cls: "life-rpg-boss-select-desc",
		});

		const grid = section.createDiv({ cls: "life-rpg-boss-grid" });
		for (const template of BOSS_TEMPLATES) {
			const card = grid.createDiv({ cls: "life-rpg-boss-select-card" });

			const iconEl = card.createDiv({ cls: "boss-template-icon" });
			renderIcon(iconEl, template.icon);

			const info = card.createDiv({ cls: "life-rpg-select-card-info" });
			info.createEl("div", {
				text: template.name,
				cls: "life-rpg-boss-select-name",
			});
			info.createEl("div", {
				text: `HP: ${template.baseHp} | ATK: ${template.attackPower}`,
				cls: "life-rpg-boss-select-stats",
			});
			info.createEl("div", {
				text: `Reward: +${template.xpReward} XP, +${template.gpReward} GP`,
				cls: "life-rpg-boss-select-rewards",
			});

			card.addEventListener("click", () => {
				const char = this.stateManager.getState().character;
				const boss = createBossFromTemplate(template, char.attributes);
				this.stateManager.setActiveBoss(boss);
			});
		}
	}

	private renderActiveDungeon(parent: HTMLElement, dungeon: Dungeon): void {
		const section = parent.createDiv({ cls: "life-rpg-active-dungeon" });

		const header = section.createDiv({ cls: "life-rpg-dungeon-header" });
		const iconEl = header.createDiv({ cls: "dungeon-icon" });
		renderIcon(iconEl, dungeon.icon);

		header.createEl("h4", { text: dungeon.name, cls: "life-rpg-dungeon-name" });

		// Visual dungeon map
		const mapDiv = section.createDiv({ cls: "life-rpg-dungeon-map" });
		for (let i = 0; i < dungeon.stages.length; i++) {
			const stage = dungeon.stages[i];
			const isComplete = stage.tasksCompleted >= stage.tasksRequired;
			const isCurrent = i === dungeon.currentStage;
			
			const nodeEl = mapDiv.createDiv({ 
				cls: `life-rpg-dungeon-map-node ${isComplete ? "is-complete" : ""} ${isCurrent ? "is-current" : ""}`,
			});
			nodeEl.setText(isComplete ? "✓" : `${i + 1}`);
			nodeEl.title = `${stage.name} (${stage.tasksCompleted}/${stage.tasksRequired})`;

			// Connector line between nodes
			if (i < dungeon.stages.length - 1) {
				mapDiv.createDiv({ cls: `life-rpg-dungeon-map-connector ${isComplete ? "is-complete" : ""}` });
			}
		}
		// Final boss node
		const bossNode = mapDiv.createDiv({ cls: "life-rpg-dungeon-map-node" });
		bossNode.setText("💀");
		bossNode.title = "Final Boss";

		// Overall progress bar
		const progress = getDungeonProgress(dungeon);
		const progressSection = section.createDiv({ cls: "life-rpg-stat-section" });
		const progressHeader = progressSection.createDiv({ cls: "life-rpg-stat-header" });
		progressHeader.createEl("span", { text: "Progress", cls: "life-rpg-stat-label" });
		progressHeader.createEl("span", {
			text: `${Math.round(progress)}%`,
			cls: "life-rpg-stat-value",
		});
		const barContainer = progressSection.createDiv({ cls: "life-rpg-bar-container" });
		const bar = barContainer.createDiv({ cls: "life-rpg-bar life-rpg-bar-dungeon" });
		bar.style.width = `${progress}%`;

		// Current stage
		const currentStage = getCurrentDungeonStage(dungeon);
		if (currentStage) {
			const stageInfo = section.createDiv({ cls: "life-rpg-dungeon-stage" });
			stageInfo.createEl("h5", {
				text: `Stage ${dungeon.currentStage + 1}: ${currentStage.name}`,
			});
			stageInfo.createEl("p", { text: currentStage.description });
			stageInfo.createEl("p", {
				text: `Tasks: ${currentStage.tasksCompleted} / ${currentStage.tasksRequired}`,
				cls: "life-rpg-dungeon-stage-progress",
			});
		}

		// Abandon dungeon
		const abandonBtn = section.createEl("button", {
			text: "🏳️ Abandon Dungeon",
			cls: "life-rpg-btn life-rpg-btn-danger life-rpg-btn-small",
		});
		abandonBtn.addEventListener("click", () => {
			if (confirm("Abandon this dungeon? Progress will be lost.")) {
				this.stateManager.setActiveDungeon(null);
			}
		});
	}

	private renderDungeonSelection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "life-rpg-dungeon-select" });
		section.createEl("h4", { text: "🏰 Enter a Dungeon" });
		section.createEl("p", {
			text: "Multi-stage challenges. Complete tasks to clear each stage!",
			cls: "life-rpg-dungeon-select-desc",
		});

		const grid = section.createDiv({ cls: "life-rpg-dungeon-grid" });
		for (const template of DUNGEON_TEMPLATES) {
			const card = grid.createDiv({ cls: "life-rpg-dungeon-select-card" });

			const iconEl = card.createEl("div", {
				cls: "life-rpg-dungeon-select-icon",
			});
			if (/^[a-z0-9-]+$/.test(template.icon)) {
				setIcon(iconEl, template.icon);
			} else {
				iconEl.setText(template.icon);
			}

			const info = card.createDiv({ cls: "life-rpg-select-card-info" });
			info.createEl("div", {
				text: template.name,
				cls: "life-rpg-dungeon-select-name",
			});
			info.createEl("div", {
				text: `${template.stages.length} stages → Boss: ${template.bossTemplate.name}`,
				cls: "life-rpg-dungeon-select-info",
			});

			card.addEventListener("click", () => {
				const char = this.stateManager.getState().character;
				const dungeon = createDungeonFromTemplate(template, char.attributes);
				this.stateManager.setActiveDungeon(dungeon);
			});
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
