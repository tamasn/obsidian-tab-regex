import { Plugin } from "obsidian";

export default class TabTitleRulesPlugin extends Plugin {
	async onload() {
		console.log("Tab Title Rules: loaded");
	}

	onunload() {
		console.log("Tab Title Rules: unloaded");
	}
}
