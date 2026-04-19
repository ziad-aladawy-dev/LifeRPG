// ============================================================================
// Life RPG — Skill Tree Panel
// Visualizes the branching progression system and allows spending SP.
// ============================================================================

import { setIcon } from "obsidian";
import { type StateManager } from "../../state/StateManager";
import { type SkillTreeNode, type CharacterState, Attribute } from "../../types";
import { SKILL_TREE_NODES } from "../../constants";

export class SkillTreePanel {
	private containerEl: HTMLElement;
	private stateManager: StateManager;

	constructor(parentEl: HTMLElement, stateManager: StateManager) {
		this.containerEl = parentEl.createDiv({ cls: "life-rpg-skill-tree-panel" });
		this.stateManager = stateManager;
	}

	render(): void {
		const el = this.containerEl;
		el.empty();
		el.addClass("life-rpg-skill-tree-container");

		const character = this.stateManager.getCharacter();
		const unlockedNodes = this.stateManager.getUnlockedSkillNodes();
		const availableSP = this.stateManager.getSkillPoints();

		// Header Section
		const header = el.createDiv({ cls: "life-rpg-skill-tree-header" });
		const titleGroup = header.createDiv({ cls: "life-rpg-title-group" });
		titleGroup.createEl("h2", { text: "🌌 Constellation of Growth" });
		titleGroup.createEl("span", { text: "Channel your unspent potential into new abilities.", cls: "subtitle" });
		
		const spDisplay = header.createDiv({ cls: "life-rpg-sp-display" });
		spDisplay.createEl("span", { text: availableSP.toString(), cls: "sp-value" });
		spDisplay.createEl("span", { text: " SP AVAILABLE", cls: "sp-label" });

		const respecBtn = header.createEl("button", {
			text: "Reset Tree",
			cls: "life-rpg-btn life-rpg-respec-btn",
		});
		setIcon(respecBtn, "refresh-cw");
		respecBtn.onclick = () => this.handleRespec();

		// Scrollable area
		const scrollArea = el.createDiv({ cls: "life-rpg-tree-scroll-area" });
		this.setupDraggable(scrollArea);
		
		const workspace = scrollArea.createDiv({ cls: "life-rpg-tree-workspace" });
		
		// SVG Layer for connectors
		const svg = workspace.createSvg("svg", { cls: "life-rpg-tree-svg" });
		
		// Render Connectors
		for (const node of SKILL_TREE_NODES) {
			for (const depId of node.dependencies) {
				const parent = SKILL_TREE_NODES.find(n => n.id === depId);
				if (parent) {
					const isUnlocked = unlockedNodes.includes(node.id) && unlockedNodes.includes(parent.id);
					this.drawConnector(svg, parent, node, isUnlocked);
				}
			}
		}

		// Render Nodes
		for (const node of SKILL_TREE_NODES) {
			this.renderNode(workspace, node, unlockedNodes, availableSP, character);
		}
	}

	private drawConnector(svg: SVGSVGElement, from: SkillTreeNode, to: SkillTreeNode, active: boolean): void {
		const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		line.setAttribute("x1", (from.x + 40).toString());
		line.setAttribute("y1", (from.y + 40).toString());
		line.setAttribute("x2", (to.x + 40).toString());
		line.setAttribute("y2", (to.y + 40).toString());
		line.setAttribute("class", active ? "line-active" : "line-inactive");
		svg.appendChild(line);
	}

	private renderNode(parent: HTMLElement, node: SkillTreeNode, unlocked: string[], sp: number, character: CharacterState): void {
		const isUnlocked = unlocked.includes(node.id);
		const hasDeps = node.dependencies.length === 0 || node.dependencies.every(d => unlocked.includes(d));
		const attrOk = !node.attributeThreshold || 
			((character.attributes as any)[node.attributeThreshold.attribute].level >= node.attributeThreshold.level);
		
		const canUnlock = !isUnlocked && hasDeps && attrOk && sp >= node.cost;
		
		const nodeEl = parent.createDiv({ 
			cls: `life-rpg-skill-node ${isUnlocked ? "is-unlocked" : (canUnlock ? "can-unlock" : "is-locked")} branch-${node.branch}`
		});
		
		nodeEl.style.left = `${node.x}px`;
		nodeEl.style.top = `${node.y}px`;

		const aura = nodeEl.createDiv({ cls: "node-aura" });
		const iconBox = nodeEl.createDiv({ cls: "node-icon" });
		if (/^[a-z0-9-]+$/.test(node.icon)) {
			setIcon(iconBox, node.icon);
		} else {
			iconBox.setText(node.icon);
		}

		// Node name label below icon
		nodeEl.createDiv({ cls: "life-rpg-node-label", text: node.name });

		// Click to unlock
		if (canUnlock) {
			nodeEl.onclick = () => {
				if (confirm(`Unlock "${node.name}" for ${node.cost} SP?\n\n${node.description}`)) {
					this.stateManager.unlockSkillNode(node.id);
					this.render();
				}
			};
		}

		// Rich hover tooltip
		nodeEl.addEventListener("mouseenter", () => {
			const existing = nodeEl.querySelector(".life-rpg-node-tooltip");
			if (existing) return;
			
			const tip = nodeEl.createDiv({ cls: "life-rpg-node-tooltip" });
			tip.createDiv({ cls: "life-rpg-node-tooltip-name", text: node.name });
			tip.createDiv({ cls: "life-rpg-node-tooltip-desc", text: node.description });
			tip.createDiv({ cls: "life-rpg-node-tooltip-cost", text: `Cost: ${node.cost} SP` });
			
			if (isUnlocked) {
				tip.createDiv({ cls: "life-rpg-node-tooltip-cost", text: "✓ Unlocked" });
			}

			if (node.attributeThreshold) {
				const attrName = node.attributeThreshold.attribute.toUpperCase();
				const met = attrOk ? "✓" : "✕";
				tip.createDiv({ cls: "life-rpg-node-tooltip-req", text: `${met} Requires ${attrName} Level ${node.attributeThreshold.level}` });
			}

			if (node.dependencies.length > 0) {
				const depNames = node.dependencies.map(d => {
					const dep = SKILL_TREE_NODES.find(n => n.id === d);
					const met = unlocked.includes(d) ? "✓" : "✕";
					return `${met} ${dep ? dep.name : d}`;
				}).join(", ");
				tip.createDiv({ cls: "life-rpg-node-tooltip-req", text: `Requires: ${depNames}` });
			}
		});

		nodeEl.addEventListener("mouseleave", () => {
			const tip = nodeEl.querySelector(".life-rpg-node-tooltip");
			if (tip) tip.remove();
		});
	}


	private handleRespec(): void {
		const inventory = this.stateManager.getInventory();
		const mirror = inventory.find(i => i.id === "respec-mirror");
		
		if (!mirror) {
			alert("You need a 'Mirror of Rebirth' to respec your skill tree. Buy it in the Store!");
			return;
		}

		if (confirm("Are you sure you want to reset your skill tree? All nodes will be locked and all SP refunded.")) {
			this.stateManager.respecSkillTree();
			this.render();
		}
	}

	private setupDraggable(el: HTMLElement): void {
		let isDown = false;
		let startX: number;
		let startY: number;
		let scrollLeft: number;
		let scrollTop: number;

		el.addEventListener("mousedown", (e) => {
			isDown = true;
			el.addClass("active");
			startX = e.pageX - el.offsetLeft;
			startY = e.pageY - el.offsetTop;
			scrollLeft = el.scrollLeft;
			scrollTop = el.scrollTop;
		});

		el.addEventListener("mouseleave", () => {
			isDown = false;
		});

		el.addEventListener("mouseup", () => {
			isDown = false;
		});

		el.addEventListener("mousemove", (e) => {
			if (!isDown) return;
			e.preventDefault();
			const x = e.pageX - el.offsetLeft;
			const y = e.pageY - el.offsetTop;
			const walkX = (x - startX) * 1.5;
			const walkY = (y - startY) * 1.5;
			el.scrollLeft = scrollLeft - walkX;
			el.scrollTop = scrollTop - walkY;
		});
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
