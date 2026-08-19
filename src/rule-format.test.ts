import { describe, expect, it } from "vitest";
import { formatRuleSummary, ruleRowLabel, rulePatternError } from "./rule-format";
import { validateRule } from "./rules";
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

	// decision: enabled state is not part of the summary string — the row's own toggle/affordance
	// carries that, so formatRuleSummary must not prefix a disabled rule with "(off) " or similar.
	it("formats a disabled rule identically to an otherwise-identical enabled rule — no '(off)' prefix", () => {
		const enabledRule = makeRule({ pattern: "foo", replacement: "bar", global: true, ignoreCase: false, enabled: true });
		const disabledRule = { ...enabledRule, enabled: false };

		const formatted = formatRuleSummary(disabledRule);
		expect(formatted).toBe("/foo/g → bar");
		expect(formatted.startsWith("(off)")).toBe(false);
		expect(formatted).toBe(formatRuleSummary(enabledRule));
	});
});

describe("rulePatternError", () => {
	it("composes { ...rule, pattern: candidatePattern } and defers to validateRule for the verdict", () => {
		const validRule = makeRule({ pattern: "original", global: false, ignoreCase: false });
		expect(rulePatternError(validRule, "^ok$")).toBeNull();

		const nonCompilingCases = [
			{
				label: "a non-compiling candidate returns validateRule's own error, not a hand-written one",
				rule: makeRule({ pattern: "original", global: false, ignoreCase: false }),
				candidatePattern: "(",
			},
			{
				// gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md
				// An empty pattern compiles (it matches everything) so only validateRule's explicit
				// empty-pattern rejection makes this non-null; rulePatternError must not special-case it.
				label: "an empty candidate returns validateRule's own error, not a hand-written one",
				rule: makeRule({ pattern: "original", global: false, ignoreCase: false }),
				candidatePattern: "",
			},
			{
				// Load-bearing: the rule's own flags (not defaults) must reach validateRule. Derives the
				// expected error from validateRule({ ...rule, pattern }) using this same non-default-flag
				// rule, so an implementation that drops or hardcodes the flags would compose a different
				// object than the one this test's expectation is derived from.
				label: "a non-compiling candidate is validated against the rule's own non-default flags",
				rule: makeRule({ pattern: "original", global: true, ignoreCase: true }),
				candidatePattern: "(unterminated",
			},
		];

		for (const { label, rule, candidatePattern } of nonCompilingCases) {
			const expected = validateRule({ ...rule, pattern: candidatePattern });
			// anti-drift: never hand-write the expected error string — derive it from validateRule,
			// the single validation gate, so a re-implementation drifting from that gate fails here.
			expect(expected.ok, label).toBe(false);
			const expectedError = expected.ok ? null : expected.error;
			expect(rulePatternError(rule, candidatePattern), label).toBe(expectedError);
		}
	});

	it("a candidate that compiles under the rule's own flags returns null even when the flags are non-default", () => {
		const rule = makeRule({ pattern: "original", global: true, ignoreCase: true });
		expect(rulePatternError(rule, "^ok$")).toBeNull();
	});
});
