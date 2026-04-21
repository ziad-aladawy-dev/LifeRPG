import { App, TFile } from "obsidian";
import { type TrackedTask, type TaskMetadata } from "../types";

export async function updateTaskInFile(
	app: App,
	task: TrackedTask,
	questId: string
): Promise<boolean> {
	try {
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!(file instanceof TFile)) return false;

		const content = await app.vault.read(file);
		const lines = content.split("\n");

		// Verify line still contains the task text (robustness)
		const currentLine = lines[task.line];
		if (!currentLine || !currentLine.includes(task.text.trim().substring(0, 10))) {
			// Line shifted? Fuzzy search for the task text
			const index = lines.findIndex(l => l.includes(task.text.trim()));
			if (index !== -1) {
				task.line = index;
			} else {
				console.error("Life RPG: Could not find task in file to update ID.");
				return false;
			}
		}

		// If ID already exists, don't double add
		if (lines[task.line].includes(`[id: ${questId}]`)) return true;

		// Append the ID to the end of the line
		lines[task.line] = lines[task.line].trimEnd() + ` [id: ${questId}]`;

		await app.vault.modify(file, lines.join("\n"));
		return true;
	} catch (error) {
		console.error("Life RPG: Error updating task file:", error);
		return false;
	}
}
