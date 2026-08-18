import { describe, expect, it, vi } from "vitest";
import type { App, PluginManifest } from "obsidian";
import TabTitleRulesPlugin from "./main";
import { makeRule } from "./test-fixtures";

describe("TabTitleRulesPlugin.saveSettings", () => {
	// decision: architecture/decisions/2026-08-14-OTR-0003-savesettings-reruns-mergesettings-as-integrity-gate.md
	// This test's job is the WIRING — that saveSettings() actually invokes mergeSettings before
	// persisting — not the sanitization logic itself, which src/rules.test.ts already covers as a
	// unit against mergeSettings directly. Do not delete this as a duplicate of that coverage.
	// Pins saveSettings() only: a rule bypassing the settings-tab's own enabled/pattern guard
	// can't reach saveData through this method, and the live plugin.settings matches what was
	// persisted (checked via an independently cloned snapshot, not the same reference).
	// savePreferences() (src/main.ts) also calls saveData() directly without mergeSettings and is
	// deliberately left unpinned here: it is a separately-decided non-bumping write path, see
	// architecture/decisions/2026-08-14-OTR-0003-sample-path-edits-use-non-bumping-savepreferences.md
	it("re-runs stored settings through mergeSettings before persisting", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = new TabTitleRulesPlugin({} as App, {} as PluginManifest);
		let persisted!: typeof plugin.settings;
		const saveData = vi.spyOn(plugin, "saveData").mockImplementation(async (data) => {
			persisted = structuredClone(data as typeof plugin.settings);
		});
		plugin.settings = { rules: [makeRule({ pattern: "", enabled: true })], rulesRevision: 0 };

		await plugin.saveSettings();

		expect(saveData).toHaveBeenCalledTimes(1);
		expect(persisted.rules).toHaveLength(1);
		expect(persisted.rules[0].enabled).toBe(false);
		expect(plugin.settings.rules[0].enabled).toBe(false);
		expect(plugin.settings.rulesRevision).toBe(1);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
