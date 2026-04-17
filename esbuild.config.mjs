import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Test vault plugin directory — build output is copied here
const TEST_VAULT_PLUGIN_DIR = "d:\\_\\ObsidianRPG System Test\\.obsidian\\plugins\\life-rpg";

/** Copy built files to the test vault for live testing */
function copyToTestVault() {
	const filesToCopy = ["main.js", "manifest.json", "styles.css"];
	for (const file of filesToCopy) {
		const src = path.resolve(file);
		const dest = path.join(TEST_VAULT_PLUGIN_DIR, file);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, dest);
			console.log(`  → Copied ${file} to test vault`);
		}
	}
}

const copyPlugin = {
	name: "copy-to-vault",
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length === 0) {
				copyToTestVault();
			}
		});
	},
};

const context = await esbuild.context({
	entryPoints: ["src/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
	plugins: [copyPlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
