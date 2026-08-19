import { describe, expect, it } from "vitest";
import { formatRuleSummary, ruleRowLabel, rulePatternError } from "./rule-format";
import { makeRule } from "./test-fixtures";

describe("ruleRowLabel", () => {
	it("falls back from name to pattern to a fixed placeholder, in that order", () => {
		const cases = [
			{
				label: "named rule uses the name",
				rule: makeRule({ name: "My Rule", pattern: "foo" }),
				expected: "My Rule",
			},
			{
				label: "unnamed rule with a pattern uses the pattern",
				rule: makeRule({ name: undefined, pattern: "foo" }),
				expected: "foo",
			},
			{
				// gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md
				// A coerced/fresh rule can carry an empty pattern; the label must not render blank.
				label: "unnamed rule with an empty pattern falls back to the fixed placeholder",
				rule: makeRule({ name: undefined, pattern: "" }),
				expected: "New rule",
			},
			{
				label: "an empty-string name is falsy and falls through to the pattern, not a blank label",
				rule: makeRule({ name: "", pattern: "foo" }),
				expected: "foo",
			},
		];

		for (const { label, rule, expected } of cases) {
			expect(ruleRowLabel(rule), label).toBe(expected);
		}
	});
});

describe("formatRuleSummary", () => {
	it("renders /pattern/flags → replacement with the compiled flag string", () => {
		const cases = [
			{
				label: "no flags",
				rule: makeRule({ pattern: "foo", replacement: "bar", global: false, ignoreCase: false }),
				expected: "/foo/ → bar",
			},
			{
				label: "global only",
				rule: makeRule({ pattern: "foo", replacement: "bar", global: true, ignoreCase: false }),
				expected: "/foo/g → bar",
			},
			{
				label: "ignoreCase only",
				rule: makeRule({ pattern: "foo", replacement: "bar", global: false, ignoreCase: true }),
				expected: "/foo/i → bar",
			},
			{
				label: "both flags",
				rule: makeRule({ pattern: "foo", replacement: "bar", global: true, ignoreCase: true }),
				expected: "/foo/gi → bar",
			},
		];

		for (const { label, rule, expected } of cases) {
			expect(formatRuleSummary(rule), label).toBe(expected);
		}
	});

	// decision: architecture/decisions/2026-08-19-OTR-0013-rule-row-summary-carries-no-enabled-state.md
	// Enabled state is not part of the summary string — the row's own toggle/affordance
	// carries that, so formatRuleSummary must not prefix a disabled rule with "(off) " or similar.
	it("formats a disabled rule identically to an otherwise-identical enabled rule — no '(off)' prefix", () => {
		const enabledRule = makeRule({ pattern: "foo", replacement: "bar", global: true, ignoreCase: false, enabled: true });
		const disabledRule = { ...enabledRule, enabled: false };

		// The literal below already pins the "(off)"-absence intent on its own: formatRuleSummary
		// ignores `enabled` entirely, so a disabled rule's summary is indistinguishable from an
		// otherwise-identical enabled rule's.
		expect(formatRuleSummary(disabledRule)).toBe("/foo/g → bar");
	});
});

describe("rulePatternError", () => {
	it("returns null for a rule whose pattern compiles", () => {
		const rule = makeRule({ pattern: "^ok$", global: false, ignoreCase: false });
		expect(rulePatternError(rule)).toBeNull();
	});

	it("returns null for a compiling pattern even when the rule's flags are non-default", () => {
		const rule = makeRule({ pattern: "^ok$", global: true, ignoreCase: true });
		expect(rulePatternError(rule)).toBeNull();
	});

	it("rejects a non-compiling pattern with validateRule's own error, against a literal expected value", () => {
		// anti-drift note: the expected strings below are literal, not derived by calling
		// validateRule (rulePatternError's own dependency) — deriving the expectation from the
		// function under test's own dependency would make this pass vacuously against a
		// rulePatternError that stopped calling validateRule altogether.
		const rule = makeRule({ pattern: "(", global: false, ignoreCase: false });
		expect(rulePatternError(rule)).toBe("Invalid regular expression: /(/: Unterminated group");
	});

	// gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md
	// An empty pattern compiles (it matches everything) so only validateRule's explicit
	// empty-pattern rejection makes this non-null; rulePatternError must not special-case it.
	it("rejects an empty pattern with validateRule's own empty-pattern message", () => {
		const rule = makeRule({ pattern: "", global: false, ignoreCase: false });
		expect(rulePatternError(rule)).toBe("Pattern must not be empty.");
	});

	it("validates against the rule's own non-default flags, not hardcoded/default ones", () => {
		// Load-bearing: pinned via the compiled flag string V8 embeds in the SyntaxError message
		// ("/gi:"), an observable property independent of validateRule itself — not by calling
		// validateRule as the oracle. Still fails against an implementation that drops the rule's
		// flags before validating (that would produce a message without "/gi:").
		const rule = makeRule({ pattern: "(unterminated", global: true, ignoreCase: true });
		const message = rulePatternError(rule);
		expect(message).toContain("/gi:");
		expect(message).toBe("Invalid regular expression: /(unterminated/gi: Unterminated group");
	});
});
