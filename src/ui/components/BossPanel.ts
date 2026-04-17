// ============================================================================
// Life RPG — Boss Panel
// Displays active boss fights, dungeon progress, and boss selection.
// ============================================================================

import { type Boss, type Dungeon } from "../../types";
import { type StateManager } from "../../state/StateManager";
import { formatNumber, percentage } from "../../utils/formatter";
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
		header.createEl("h3", { text: "⚔️ Adventures" });

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

		const bossCard = section.createDiv({ cls: "life-rpg-boss-card" });

		// Boss header
		const bossHeader = bossCard.createDiv({ cls: "life-rpg-boss-header" });
		bossHeader.createEl("span", {
			text: boss.icon,
			cls: "life-rpg-boss-icon",
		});
		const bossInfo = bossHeader.createDiv({ cls: "life-rpg-boss-info" });
		bossInfo.createEl("h4", { text: boss.name, cls: "life-rpg-boss-name" });
		bossInfo.createEl("p", {
			text: boss.flavor,
			cls: "life-rpg-boss-flavor",
		});

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

			card.createEl("div", {
				text: template.icon,
				cls: "life-rpg-boss-select-icon",
			});

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
				const boss = createBossFromTemplate(template);
				this.stateManager.setActiveBoss(boss);
			});
		}
	}

	private renderActiveDungeon(parent: HTMLElement, dungeon: Dungeon): void {
		const section = parent.createDiv({ cls: "life-rpg-active-dungeon" });

		const header = section.createDiv({ cls: "life-rpg-dungeon-header" });
		header.createEl("span", { text: dungeon.icon, cls: "life-rpg-dungeon-icon" });
		header.createEl("h4", { text: dungeon.name, cls: "life-rpg-dungeon-name" });

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

			card.createEl("div", {
				text: template.icon,
				cls: "life-rpg-dungeon-select-icon",
			});

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
				const dungeon = createDungeonFromTemplate(template);
				this.stateManager.setActiveDungeon(dungeon);
			});
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
