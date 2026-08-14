import { Plugin } from "obsidian";
import {
	bumpRevision,
	createDefaultSettings,
	mergeSettings,
	type TabTitleRulesSettings,
} from "./rules";

export default class TabTitleRulesPlugin extends Plugin {
	settings: TabTitleRulesSettings = createDefaultSettings();

	async onload() {
		await this.loadSettings();
		console.log("Tab Title Rules: loaded");
	}

	onunload() {
		console.log("Tab Title Rules: unloaded");
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		this.settings = bumpRevision(this.settings);
		await this.saveData(this.settings);
	}

	/**
	 * Persists settings without bumping rulesRevision. saveSettings()'s bump is the
	 * whole-workspace tab-title cache-invalidation trigger, so routing a cosmetic
	 * sample-path edit through it would invalidate every cached title on each
	 * keystroke. Rule mutations keep using saveSettings(); sample-path edits use this.
	 */
	async savePreferences() {
		await this.saveData(this.settings);
	}
}
