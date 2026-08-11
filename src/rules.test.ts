import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	validateRule,
	type Rule,
	type TabTitleRulesSettings,
} from "./rules";

function makeRule(overrides: Partial<Rule> = {}): Rule {
	return {
		id: "rule-1",
		name: undefined,
		pattern: "foo",
		replacement: "bar",
		global: false,
		ignoreCase: false,
		enabled: true,
		...overrides,
	};
}

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

	it("compiles the pattern with the rule's own global/ignoreCase flags (valid case)", () => {
		// A pattern that is valid regardless of flags, but exercises flag-aware compilation.
		const result = validateRule(
			makeRule({ pattern: "FOO", global: true, ignoreCase: true })
		);
		expect(result).toEqual({ ok: true });
	});

	it("still reports the same invalid pattern as an error under different flag combinations", () => {
		const withGlobal = validateRule(
			makeRule({ pattern: "([unclosed", global: true, ignoreCase: false })
		);
		const withIgnoreCase = validateRule(
			makeRule({ pattern: "([unclosed", global: false, ignoreCase: true })
		);
		expect(withGlobal.ok).toBe(false);
		expect(withIgnoreCase.ok).toBe(false);
	});
});
