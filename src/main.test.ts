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
	// savePreferences() (src/main.ts) is pinned separately below, in the
	// TabTitleRulesPlugin.savePreferences block: same mergeSettings gate, minus bumpRevision, per
	// the non-bumping write-path decision, see
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

describe("TabTitleRulesPlugin.savePreferences", () => {
	// decision: architecture/decisions/2026-08-14-OTR-0003-savesettings-reruns-mergesettings-as-integrity-gate.md
	// decision: architecture/decisions/2026-08-14-OTR-0003-sample-path-edits-use-non-bumping-savepreferences.md
	// savePreferences() is the non-bumping write path for cosmetic sample-path edits. It must run
	// through the same mergeSettings integrity gate as saveSettings(), minus bumpRevision and minus
	// scheduleWorkspaceSweep. These tests pin that gate directly on savePreferences(), plus the
	// no-bump contract that distinguishes it from saveSettings().
	it("sanitizes an enabled rule with a non-compiling pattern before persisting", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = new TabTitleRulesPlugin({} as App, {} as PluginManifest);
		let persisted!: typeof plugin.settings;
		const saveData = vi.spyOn(plugin, "saveData").mockImplementation(async (data) => {
			persisted = structuredClone(data as typeof plugin.settings);
		});
		plugin.settings = { rules: [makeRule({ pattern: "(", enabled: true })], rulesRevision: 0 };

		await plugin.savePreferences();

		expect(saveData).toHaveBeenCalledTimes(1);
		expect(persisted.rules).toHaveLength(1);
		expect(persisted.rules[0].enabled).toBe(false);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	// Regression pin, not redundant: this currently passes only because savePreferences() doesn't
	// sanitize at all yet. Once the integrity gate is wired in, it must keep passing without also
	// routing through bumpRevision — i.e. the fix must not simply become a call to saveSettings().
	it("does not bump rulesRevision even when sanitization changes a rule", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = new TabTitleRulesPlugin({} as App, {} as PluginManifest);
		vi.spyOn(plugin, "saveData").mockImplementation(async () => {});
		plugin.settings = { rules: [makeRule({ pattern: "(", enabled: true })], rulesRevision: 5 };

		await plugin.savePreferences();

		expect(plugin.settings.rulesRevision).toBe(5);
	});

	it("leaves plugin.settings itself sanitized, matching the persisted payload", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = new TabTitleRulesPlugin({} as App, {} as PluginManifest);
		let persisted!: typeof plugin.settings;
		vi.spyOn(plugin, "saveData").mockImplementation(async (data) => {
			persisted = structuredClone(data as typeof plugin.settings);
		});
		plugin.settings = { rules: [makeRule({ pattern: "(", enabled: true })], rulesRevision: 0 };

		await plugin.savePreferences();

		expect(plugin.settings.rules[0].enabled).toBe(false);
		expect(plugin.settings).toEqual(persisted);
	});
});
