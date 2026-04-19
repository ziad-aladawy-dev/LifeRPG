import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Test vault plugin directory — build output is copied here
const TEST_VAULT_PLUGIN_DIR = "d:\\_\\Ideaverse\\.obsidian\\plugins\\life-rpg";

/** Copy built files to the test vault for live testing */
function copyToTestVault() {
	const filesToCopy = ["main.js", "manifest.json", "styles.css"];
	for (const file of filesToCopy) {
		const src = path.resolve(file);
		const dest = path.join(TEST_VAULT_PLUGIN_DIR, file);
		if (fs.existsSync(src)) {
			try {
				fs.copyFileSync(src, dest);
			} catch (e) {
				// ignore error if destination directory doesn't exist
			}
			console.log(`  → Copied ${file} to test vault`);
		}
	}

	// Copy assets directory recursively
	const assetsDir = path.resolve("assets");
	if (fs.existsSync(assetsDir)) {
		copyDirRecursive(assetsDir, path.join(TEST_VAULT_PLUGIN_DIR, "assets"));
		console.log("  → Copied assets/ to test vault");
	}
}

/** Recursively copy a directory */
function copyDirRecursive(src, dest) {
	if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		const srcPath = path.join(src, entry.name);
		const destPath = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyDirRecursive(srcPath, destPath);
		} else {
			fs.copyFileSync(srcPath, destPath);
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
