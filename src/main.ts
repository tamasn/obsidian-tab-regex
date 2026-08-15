import { debounce, Plugin, type Debouncer } from "obsidian";
import {
	bumpRevision,
	createDefaultSettings,
	mergeSettings,
	type TabTitleRulesSettings,
} from "./rules";
import { TabTitleRulesSettingTab } from "./settings-tab";
import { installTitlePatch, sweepWorkspace } from "./tab-titles";
import { TitleCache } from "./title-cache";

const WORKSPACE_SWEEP_DEBOUNCE_MS = 400;

export default class TabTitleRulesPlugin extends Plugin {
	settings: TabTitleRulesSettings = createDefaultSettings();
	titleCache = new TitleCache();
	private scheduleWorkspaceSweep: Debouncer<[], void> = debounce(
		() => sweepWorkspace(this.app),
		WORKSPACE_SWEEP_DEBOUNCE_MS,
		true
	);

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TabTitleRulesSettingTab(this.app, this));
		const uninstallTitlePatch = installTitlePatch(this);
		this.register(() => {
			uninstallTitlePatch();
			sweepWorkspace(this.app);
		});
		this.app.workspace.onLayoutReady(() => sweepWorkspace(this.app));
		console.log("Tab Title Rules: loaded");
	}

	onunload() {
		this.scheduleWorkspaceSweep.cancel();
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
		this.scheduleWorkspaceSweep();
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
