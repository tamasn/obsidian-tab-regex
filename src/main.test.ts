import { describe, expect, it, vi } from "vitest";
import TabTitleRulesPlugin from "./main";
import { makeRule } from "./test-fixtures";

describe("TabTitleRulesPlugin.saveSettings", () => {
	// decision: architecture/decisions/2026-08-14-OTR-0003-savesettings-reruns-mergesettings-as-integrity-gate.md
	// This test's job is the WIRING — that saveSettings() actually invokes mergeSettings before
	// persisting — not the sanitization logic itself, which src/rules.test.ts already covers as a
	// unit against mergeSettings directly. Do not delete this as a duplicate of that coverage.
	it("re-runs stored settings through mergeSettings before persisting, so a rule bypassing the settings-tab's own enabled/pattern guard can't reach saveData or the live settings still enabled", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const plugin = new (TabTitleRulesPlugin as unknown as new () => TabTitleRulesPlugin)();
		const saveData = vi.spyOn(plugin, "saveData").mockResolvedValue(undefined);
		plugin.settings = { rules: [makeRule({ pattern: "", enabled: true })], rulesRevision: 0 };

		await plugin.saveSettings();

		expect(saveData).toHaveBeenCalledTimes(1);
		const persisted = saveData.mock.calls[0][0] as typeof plugin.settings;
		expect(persisted.rules[0].enabled).toBe(false);
		expect(plugin.settings.rules[0].enabled).toBe(false);
		expect(plugin.settings.rulesRevision).toBeGreaterThan(0);
		expect(warn).toHaveBeenCalled();
	});
});
