import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_SAMPLE_PATH,
	DEFAULT_SETTINGS,
	bumpRevision,
	createDefaultSettings,
	mergeSettings,
	validateRule,
	type TabTitleRulesSettings,
} from "./rules";
import { applyRules } from "./engine";
import { makeRule } from "./test-fixtures";

describe("DEFAULT_SETTINGS", () => {
	it("is an empty rule list at revision 0", () => {
		const settings: TabTitleRulesSettings = DEFAULT_SETTINGS;
		expect(settings.rules).toEqual([]);
		expect(settings.rulesRevision).toBe(0);
	});
});

describe("validateRule", () => {
	it("accepts a valid pattern", () => {
		const result = validateRule(makeRule({ pattern: "^foo(bar)?$" }));
		expect(result).toEqual({ ok: true });
	});

	it("rejects an invalid pattern with a non-empty error message", () => {
		const result = validateRule(makeRule({ pattern: "([unclosed" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(typeof result.error).toBe("string");
			expect(result.error.length).toBeGreaterThan(0);
		}
	});

	// gotcha: architecture/gotchas/2026-08-12-work-coerced-placeholder-empty-pattern-matches-everything.md
	it("rejects an empty pattern with a non-empty error message", () => {
		const result = validateRule(makeRule({ pattern: "" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(typeof result.error).toBe("string");
			expect(result.error.length).toBeGreaterThan(0);
		}
	});
});

describe("createDefaultSettings", () => {
	it("returns a fresh rules array on every call", () => {
		const a = createDefaultSettings();
		const b = createDefaultSettings();
		expect(a.rules).not.toBe(b.rules);
		expect(a).toEqual({ rules: [], rulesRevision: 0, samplePath: DEFAULT_SAMPLE_PATH });
	});

	it("mutating one caller's rules array does not affect another caller's", () => {
		const a = createDefaultSettings();
		a.rules.push(makeRule());
		const b = createDefaultSettings();
		expect(b.rules).toEqual([]);
	});
});

describe("mergeSettings", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns fresh default settings for null (first-run loadData)", () => {
		const result = mergeSettings(null);
		expect(result).toEqual({ rules: [], rulesRevision: 0, samplePath: DEFAULT_SAMPLE_PATH });
	});

	it("returned rules array is not aliased to DEFAULT_SETTINGS.rules", () => {
		const result = mergeSettings(null);
		expect(result.rules).not.toBe(DEFAULT_SETTINGS.rules);
		expect(() => result.rules.push(makeRule())).not.toThrow();
	});

	it("merges a valid persisted rulesRevision and rules array", () => {
		const rule = makeRule({ pattern: "^ok$" });
		const result = mergeSettings({ rules: [rule], rulesRevision: 7 });
		expect(result.rulesRevision).toBe(7);
		expect(result.rules).toEqual([rule]);
	});

	it("ignores a non-object payload and falls back to defaults", () => {
		expect(mergeSettings(undefined)).toEqual({ rules: [], rulesRevision: 0, samplePath: DEFAULT_SAMPLE_PATH });
		expect(mergeSettings("garbage")).toEqual({ rules: [], rulesRevision: 0, samplePath: DEFAULT_SAMPLE_PATH });
		expect(mergeSettings(42)).toEqual({ rules: [], rulesRevision: 0, samplePath: DEFAULT_SAMPLE_PATH });
	});

	it("forces an enabled rule with an invalid pattern to enabled: false, keeping the rest of the data", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = makeRule({ pattern: "([unclosed", enabled: true });
		const result = mergeSettings({ rules: [broken], rulesRevision: 0 });
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]).toEqual({ ...broken, enabled: false });
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("does not drop the invalid rule from the array", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = makeRule({ pattern: "([unclosed", enabled: true });
		const healthy = makeRule({ pattern: "^ok$", enabled: true });
		const result = mergeSettings({ rules: [broken, healthy] });
		expect(result.rules).toHaveLength(2);
		expect(result.rules[0].enabled).toBe(false);
		expect(result.rules[1].enabled).toBe(true);
	});

	it("leaves an already-disabled invalid rule untouched (no redundant warning)", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const broken = makeRule({ pattern: "([unclosed", enabled: false });
		const result = mergeSettings({ rules: [broken] });
		expect(result.rules[0]).toEqual(broken);
		expect(warn).not.toHaveBeenCalled();
	});

	it("does not throw and drops a null rule element", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		let result: TabTitleRulesSettings | undefined;
		expect(() => {
			result = mergeSettings({ rules: [null] });
		}).not.toThrow();
		expect(result?.rules).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});

	it("drops a string rule element", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = mergeSettings({ rules: ["not-a-rule"] });
		expect(result.rules).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});

	it("drops a number rule element", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = mergeSettings({ rules: [42] });
		expect(result.rules).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});

	it("drops an array rule element", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = mergeSettings({ rules: [[]] });
		expect(result.rules).toEqual([]);
		expect(warn).toHaveBeenCalled();
	});

	it("coerces a shape-invalid object rule element to a disabled placeholder instead of treating it as a valid, always-matching rule", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = mergeSettings({ rules: [{ enabled: true }] });
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]).toMatchObject({
			pattern: "",
			replacement: "",
			enabled: false,
		});
		expect(warn).toHaveBeenCalled();
	});

	it("keeps a healthy rule alongside a dropped and a coerced malformed element", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const healthy = makeRule({ pattern: "^ok$", enabled: true });
		const result = mergeSettings({ rules: [null, { enabled: true }, healthy] });
		expect(result.rules).toHaveLength(2);
		expect(result.rules[0].enabled).toBe(false);
		expect(result.rules[1]).toEqual(healthy);
		expect(warn).toHaveBeenCalledTimes(2);
	});

	// A fully-shaped rule with pattern: "" passes isRule and never reaches coerceRule;
	// sanitizeRule is the only gate left, so it must ask validateRule to reject it.
	// gotcha: architecture/gotchas/2026-08-12-work-coerced-placeholder-empty-pattern-matches-everything.md
	it("force-disables a fully-shaped, enabled rule whose pattern is the empty string, keeping it in the array", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const emptyPattern = makeRule({ pattern: "", replacement: "", enabled: true });
		const result = mergeSettings({ rules: [emptyPattern] });
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]).toEqual({ ...emptyPattern, enabled: false });
		expect(warn).toHaveBeenCalled();
	});

	it("still coerces a shape-invalid rule element to a stored placeholder with pattern '' and enabled: false", () => {
		// Pin: the empty-pattern fix lives in validateRule, not coerceRule — persisted
		// placeholder data is unchanged by it.
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = mergeSettings({ rules: [{ enabled: true }] });
		expect(result.rules[0].pattern).toBe("");
		expect(result.rules[0].enabled).toBe(false);
		expect(warn).toHaveBeenCalled();
	});
});

describe("bumpRevision", () => {
	it("returns a new object with rulesRevision incremented by one", () => {
		const settings = createDefaultSettings();
		const bumped = bumpRevision(settings);
		expect(bumped.rulesRevision).toBe(1);
		expect(bumped).not.toBe(settings);
	});

	it("does not mutate the input settings object", () => {
		const settings: TabTitleRulesSettings = { rules: [], rulesRevision: 3 };
		bumpRevision(settings);
		expect(settings.rulesRevision).toBe(3);
	});
});

describe("mergeSettings — samplePath", () => {
	it("defaults to DEFAULT_SAMPLE_PATH when absent from persisted data, not undefined", () => {
		const result = mergeSettings({ rules: [], rulesRevision: 0 });
		expect(result.samplePath).toBe(DEFAULT_SAMPLE_PATH);
		expect(result.samplePath).not.toBeUndefined();
	});

	it("falls back to DEFAULT_SAMPLE_PATH when the persisted value is not a string", () => {
		const result = mergeSettings({ rules: [], rulesRevision: 0, samplePath: 42 });
		expect(result.samplePath).toBe(DEFAULT_SAMPLE_PATH);
	});
});

describe("mergeSettings — migration pin: adding a required Rule field must not disable stored rules", () => {
	// Expected to be green immediately — this is a regression sensor, not a red test. isRule
	// requires every field and routes any mismatch to coerceRule, which force-disables the rule,
	// so adding a required field to Rule without updating isRule/coerceRule would silently disable
	// every rule already saved by a user on upgrade.
	// gotcha: architecture/gotchas/2026-08-12-work-isrule-required-field-disables-all-stored-rules.md
	it("a stored rule in today's six-field shape passes isRule and survives mergeSettings untouched, enabled preserved", () => {
		const stored = {
			id: "stored-1",
			pattern: "^ok$",
			replacement: "ok",
			global: false,
			ignoreCase: false,
			enabled: true,
		};
		const result = mergeSettings({ rules: [stored], rulesRevision: 0 });
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]).toEqual(stored);
		expect(result.rules[0].enabled).toBe(true);
	});
});

describe("mergeSettings + applyRules — load boundary for an enabled empty-pattern rule", () => {
	// gotcha: architecture/gotchas/2026-08-12-work-coerced-placeholder-empty-pattern-matches-everything.md
	it("an enabled empty-pattern rule no longer suppresses the basename fallback after passing through mergeSettings", () => {
		const emptyPattern = makeRule({ pattern: "", replacement: "", enabled: true });
		const settings = mergeSettings({ rules: [emptyPattern] });
		const result = applyRules("Notes/2024/Report.md", settings.rules);
		expect(result).toBe("Report");
		expect(result).not.toBe("Notes/2024/Report");
	});
});
