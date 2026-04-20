import { App, requestUrl } from "obsidian";
import { type PluginSettings } from "../types";

/**
 * ImageCacheManager handles downloading external image URLs and storing them 
 * locally within the plugin's hidden directory for offline use.
 */
export class ImageCacheManager {
	private static instance: ImageCacheManager;
	private app: App;
	private cachePath: string;

	private constructor(app: App) {
		this.app = app;
		// Paths are relative to vault root. 
		// We store in the plugin's folder so it's somewhat isolated.
		this.cachePath = `${app.vault.configDir}/plugins/life-rpg/image_cache`;
	}

	static getInstance(app: App): ImageCacheManager {
		if (!ImageCacheManager.instance) {
			ImageCacheManager.instance = new ImageCacheManager(app);
		}
		return ImageCacheManager.instance;
	}

	/** Ensure the cache directory exists */
	async initialize(): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.cachePath))) {
			await adapter.mkdir(this.cachePath);
		}
	}

	/** 
	 * Returns the local cached URL for an external URL if it exists.
	 * Returns null if not cached.
	 */
	async getCachedUrl(url: string): Promise<string | null> {
		if (!url || !url.startsWith("http")) return null;
		
		const filename = await this.hashUrl(url);
		const filePath = `${this.cachePath}/${filename}`;
		
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(filePath)) {
			// Convert local path to a URL usable by <img> tags
			return (adapter as any).getResourcePath(filePath);
		}
		
		return null;
	}

	/**
	 * Downloads and saves an image if not already cached.
	 * Also prunes the cache if it exceeds settings.
	 */
	async cacheImage(url: string, settings: PluginSettings): Promise<string | null> {
		if (!url || !url.startsWith("http")) return null;

		const filename = await this.hashUrl(url);
		const filePath = `${this.cachePath}/${filename}`;
		const adapter = this.app.vault.adapter;

		// 1. Skip if already exists
		if (await adapter.exists(filePath)) {
			return (adapter as any).getResourcePath(filePath);
		}

		// 2. Download
		try {
			const response = await requestUrl({
				url: url,
				method: "GET",
				contentType: "application/octet-stream",
			});

			if (response.status !== 200) return null;

			// 3. Save
			await adapter.writeBinary(filePath, response.arrayBuffer);
			
			// 4. Prune if necessary
			await this.pruneCache(settings);

			return (adapter as any).getResourcePath(filePath);
		} catch (err) {
			console.error("Failed to cache image:", url, err);
			return null;
		}
	}

	/** Delete all cached images */
	async clearCache(): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (await adapter.exists(this.cachePath)) {
			const list = await adapter.list(this.cachePath);
			for (const file of list.files) {
				await adapter.remove(file);
			}
		}
	}

	/** Prune oldest files if cache exceeds size cap */
	async pruneCache(settings: PluginSettings): Promise<void> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.cachePath))) return;

		const list = await adapter.list(this.cachePath);
		const files = [];

		let totalSize = 0;
		for (const path of list.files) {
			const stat = await adapter.stat(path);
			if (stat) {
				files.push({ path, size: stat.size, mtime: stat.mtime });
				totalSize += stat.size;
			}
		}

		const capBytes = (settings.imageCacheSizeCap || 100) * 1024 * 1024;
		if (totalSize <= capBytes) return;

		// Sort by mtime (oldest first)
		files.sort((a, b) => a.mtime - b.mtime);

		// Delete until we are 20% below cap to avoid constant pruning
		const targetSize = capBytes * 0.8;
		for (const file of files) {
			if (totalSize <= targetSize) break;
			await adapter.remove(file.path);
			totalSize -= file.size;
		}
	}

	/** Returns current cache size in MB */
	async getCacheSizeMB(): Promise<number> {
		const adapter = this.app.vault.adapter;
		if (!(await adapter.exists(this.cachePath))) return 0;

		const list = await adapter.list(this.cachePath);
		let totalSize = 0;
		for (const path of list.files) {
			const stat = await adapter.stat(path);
			if (stat) totalSize += stat.size;
		}

		return Math.round((totalSize / (1024 * 1024)) * 10) / 10;
	}

	/** Simple SHA-256 hash for URL-to-filename mapping */
	private async hashUrl(url: string): Promise<string> {
		const msgUint8 = new TextEncoder().encode(url);
		const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
		
		// Determine extension from URL or fallback to png
		const extMatch = url.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i);
		const ext = extMatch ? extMatch[1].toLowerCase() : "png";
		
		return `${hashHex}.${ext}`;
	}
}
