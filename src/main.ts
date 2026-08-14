import { Plugin } from "obsidian";
import {
	bumpRevision,
	createDefaultSettings,
	mergeSettings,
	type TabTitleRulesSettings,
} from "./rules";
import { TabTitleRulesSettingTab } from "./settings-tab";

export default class TabTitleRulesPlugin extends Plugin {
	settings: TabTitleRulesSettings = createDefaultSettings();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TabTitleRulesSettingTab(this.app, this));
		console.log("Tab Title Rules: loaded");
	}

	onunload() {
		console.log("Tab Title Rules: unloaded");
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		// mergeSettings re-runs the same isRule/coerceRule/sanitizeRule pipeline used at
		// load time, so a write path that bypasses the settings tab's own guard (e.g.
		// enabled: true written onto an invalid-pattern rule) still can't reach disk or
		// the live settings object in a state validateRule would reject.
		this.settings = mergeSettings(bumpRevision(this.settings));
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
