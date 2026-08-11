import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type TabTitleRulesSettings } from "./rules";

export default class TabTitleRulesPlugin extends Plugin {
	settings: TabTitleRulesSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		console.log("Tab Title Rules: loaded");
	}

	onunload() {
		console.log("Tab Title Rules: unloaded");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		this.settings.rulesRevision += 1;
		await this.saveData(this.settings);
	}
}
