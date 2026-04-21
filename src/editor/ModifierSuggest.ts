// ============================================================================
// Life RPG — Editor Suggest
// Autocomplete dropdown for inline task modifiers like [skill:] and [difficulty:]
// ============================================================================

import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from "obsidian";
import type LifeRpgPlugin from "../main";
import { Difficulty } from "../types";

interface SuggestionItem {
	label: string;
	desc?: string;
	insertText: string;
	icon: string;
	type: "category" | "value";
}

export class TaskModifierSuggest extends EditorSuggest<SuggestionItem> {
	plugin: LifeRpgPlugin;

	constructor(app: App, plugin: LifeRpgPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null
	): EditorSuggestTriggerInfo | null {
		// Only trigger if we are inside a markdown file and task watcher is enabled
		const settings = this.plugin.stateManager.getSettings();
		if (!settings.enableTaskWatcher || !settings.enableEditorSuggestions) return null;

		const lineToCursor = editor.getLine(cursor.line).substring(0, cursor.ch);

		// Must be on a task line (e.g. "- [ ] " or "- [x] ")
		if (!/^\s*[-*]\s\[[ xX]\]/.test(lineToCursor)) return null;

		// We look for an open bracket that hasn't been closed yet
		const match = lineToCursor.match(/\[([^\]]*)$/);
		if (!match) return null;

		const query = match[1];

		return {
			start: { line: cursor.line, ch: match.index as number },
			end: cursor,
			query,
		};
	}

	getSuggestions(context: EditorSuggestContext): SuggestionItem[] | Promise<SuggestionItem[]> {
		const query = context.query.toLowerCase();
		const suggestions: SuggestionItem[] = [];

		// -------------------------------------------------------------------
		// Context: Difficulty
		// -------------------------------------------------------------------
		if (query.startsWith("d") && (query.includes("diff") || query.startsWith("d:"))) {
			const subQuery = query.split(":")[1]?.trim() || "";
			const options = [
				{ label: "passive", insert: "difficulty: passive]", icon: "⚪", desc: "x1 Multiplier" },
				{ label: "easy", insert: "difficulty: easy]", icon: "🟢", desc: "x1.5 Multiplier" },
				{ label: "challenging", insert: "difficulty: challenging]", icon: "🟡", desc: "x2 Multiplier" },
				{ label: "hardcore", insert: "difficulty: hardcore]", icon: "🟠", desc: "x2.5 Multiplier" },
				{ label: "madhouse", insert: "difficulty: madhouse]", icon: "🟣", desc: "x3 Multiplier" }
			];

			for (const opt of options) {
				if (opt.label.includes(subQuery)) {
					suggestions.push({
						label: opt.label,
						desc: opt.desc,
						insertText: `[${opt.insert} `,
						icon: opt.icon,
						type: "value"
					});
				}
			}
			return suggestions;
		}

		// -------------------------------------------------------------------
		// Context: Skill
		// -------------------------------------------------------------------
		if (query.startsWith("s") && (query.includes("skill") || query.startsWith("s:"))) {
			const subQuery = query.split(":")[1]?.trim() || "";
			const skills = this.plugin.stateManager.getSkills();

			for (const skill of skills) {
				if (skill.name.toLowerCase().includes(subQuery)) {
					suggestions.push({
						label: skill.name,
						desc: `Lv. ${skill.level}`,
						insertText: `[skill: ${skill.name}] `,
						icon: skill.icon || "⭐",
						type: "value"
					});
				}
			}

			if (suggestions.length === 0) {
				suggestions.push({
					label: "No matching skills",
					insertText: "",
					icon: "⚠️",
					type: "value"
				});
			}

			return suggestions;
		}

		// -------------------------------------------------------------------
		// Context: Deadline
		// -------------------------------------------------------------------
		if (query.startsWith("d") && (query.includes("due") || query.includes("dead") || query.startsWith("du:"))) {
			const today = new Date();
			
			const todayStr = today.toISOString().split("T")[0];
			
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			const tomStr = tomorrow.toISOString().split("T")[0];
			
			const nextWeek = new Date(today);
			nextWeek.setDate(nextWeek.getDate() + 7);
			const nwStr = nextWeek.toISOString().split("T")[0];

			suggestions.push(
				{ label: "Today", desc: todayStr, insertText: `[due: ${todayStr}] `, icon: "⏳", type: "value" },
				{ label: "Tomorrow", desc: tomStr, insertText: `[due: ${tomStr}] `, icon: "📅", type: "value" },
				{ label: "Next Week", desc: nwStr, insertText: `[due: ${nwStr}] `, icon: "📆", type: "value" }
			);
			return suggestions;
		}

		// -------------------------------------------------------------------
		// Context: Base Categories (Just typed `[`)
		// -------------------------------------------------------------------
		suggestions.push(
			{ label: "difficulty:", desc: "Set task difficulty multiplier", insertText: "[difficulty: ", icon: "⚔️", type: "category" },
			{ label: "skill:", desc: "Assign XP to a specific skill", insertText: "[skill: ", icon: "🧠", type: "category" },
			{ label: "due:", desc: "Set a deadline (Boss attack if missed)", insertText: "[due: ", icon: "📅", type: "category" }
		);

		// Filter categories by whatever they currently typed
		return suggestions.filter(s => s.label.toLowerCase().includes(query));
	}

	renderSuggestion(item: SuggestionItem, el: HTMLElement): void {
		el.addClass("life-rpg-suggest-item");
		
		const iconEl = el.createDiv({ cls: "life-rpg-suggest-icon" });
		iconEl.setText(item.icon);
		
		const contentEl = el.createDiv({ cls: "life-rpg-suggest-content" });
		const titleEl = contentEl.createDiv({ cls: "life-rpg-suggest-title" });
		titleEl.setText(item.label);
		
		if (item.desc) {
			const descEl = contentEl.createDiv({ cls: "life-rpg-suggest-desc" });
			descEl.setText(item.desc);
		}
	}

	selectSuggestion(item: SuggestionItem, evt: MouseEvent | KeyboardEvent): void {
		if (!item.insertText) return; // 'No matching skills' fallback

		const context = this.context;
		if (!context) return;

		// Replace the entire chunk (including the [ character) with the insert text
		context.editor.replaceRange(
			item.insertText,
			{ line: context.start.line, ch: context.start.ch },
			context.end
		);

		// If it's a category, placing cursor right after the colon and space.
		// If it's a completed value, it already added a trailing space, so cursor goes normally to the end.
	}
}
