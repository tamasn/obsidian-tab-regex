import { describe, expect, it } from "vitest";
import { applyRules, basenameOf, runChain, seedFromPath } from "./engine";
import { makeRule } from "./test-fixtures";

describe("seedFromPath", () => {
	it("strips the final extension from a vault-root-relative path", () => {
		expect(seedFromPath("Projects/Client/index.md")).toBe(
			"Projects/Client/index"
		);
	});

	it("strips only the last extension when multiple dots are present in the filename", () => {
		expect(seedFromPath("notes.v2.md")).toBe("notes.v2");
	});

	it("leaves a path with no extension unchanged", () => {
		expect(seedFromPath("Makefile")).toBe("Makefile");
	});

	it("does not treat a dot in a directory name as an extension", () => {
		expect(seedFromPath("my.folder/note.md")).toBe("my.folder/note");
	});

	it("leaves a leading-dot filename with no other dot unchanged (no extension to strip)", () => {
		expect(seedFromPath(".hidden")).toBe(".hidden");
	});
});

describe("basenameOf", () => {
	it("returns the extensionless final segment of a nested path", () => {
		expect(basenameOf("Projects/Client/index.md")).toBe("index");
	});

	it("returns the extensionless final segment of a root-level path", () => {
		expect(basenameOf("note.md")).toBe("note");
	});
});

describe("applyRules — accumulator and chaining", () => {
	it("starts the accumulator at seedFromPath(vaultPath), not the raw path", () => {
		// This rule only matches the extensionless seed exactly. If the accumulator
		// started at the raw path (with ".md" still attached), the anchored match would
		// fail, no rule would match, and this would fall back to the basename instead.
		const rule = makeRule({ pattern: "^Projects/note$", replacement: "MATCHED" });
		const result = applyRules("Projects/note.md", [rule]);
		expect(result).toBe("MATCHED");
	});

	it("skips disabled rules entirely — they neither transform nor count as a match", () => {
		const disabled = makeRule({
			pattern: "note",
			replacement: "SHOULD_NOT_APPEAR",
			enabled: false,
		});
		const result = applyRules("note.md", [disabled]);
		// The disabled rule didn't run, and no enabled rule matched, so this falls back to basename.
		expect(result).toBe("note");
		expect(result).not.toContain("SHOULD_NOT_APPEAR");
	});

	it("applies rules in array order, each rule's output feeding the next rule's input", () => {
		const rule1 = makeRule({ pattern: "note", replacement: "draft" });
		const rule2 = makeRule({ pattern: "draft", replacement: "final" });
		const result = applyRules("note.md", [rule1, rule2]);
		expect(result).toBe("final");
	});

	it("rule 2 truly sees rule 1's output, not the original accumulator (order matters)", () => {
		const renameToX = makeRule({ pattern: "^note$", replacement: "x" });
		const matchXOnly = makeRule({ pattern: "^x$", replacement: "matched-x" });
		// If rule2 ran against the original seed instead of rule1's output, "^x$" would never match.
		const result = applyRules("note.md", [renameToX, matchXOnly]);
		expect(result).toBe("matched-x");
	});

	it("uses String.replace substring semantics: unmatched remainder survives", () => {
		const rule = makeRule({ pattern: "b", replacement: "X" });
		const result = applyRules("abc.md", [rule]);
		expect(result).toBe("aXc");
	});

	it("supports backreferences in the replacement", () => {
		const rule = makeRule({ pattern: "(\\w+)-(\\w+)", replacement: "$2-$1" });
		const result = applyRules("foo-bar.md", [rule]);
		expect(result).toBe("bar-foo");
	});
});

describe("applyRules — flags", () => {
	it("global: false replaces only the first match", () => {
		const rule = makeRule({ pattern: "a", replacement: "X", global: false });
		const result = applyRules("banana.md", [rule]);
		expect(result).toBe("bXnana");
	});

	it("global: true replaces every match", () => {
		const rule = makeRule({ pattern: "a", replacement: "X", global: true });
		const result = applyRules("banana.md", [rule]);
		expect(result).toBe("bXnXnX");
	});

	it("global true vs false on the same 2+-match input produces different results", () => {
		const globalRule = makeRule({ pattern: "a", replacement: "X", global: true });
		const firstOnlyRule = makeRule({
			pattern: "a",
			replacement: "X",
			global: false,
		});
		const globalResult = applyRules("banana.md", [globalRule]);
		const firstOnlyResult = applyRules("banana.md", [firstOnlyRule]);
		expect(globalResult).not.toBe(firstOnlyResult);
	});

	it("applyRules is idempotent call-to-call: repeated invocation with the same global rule object is stable", () => {
		const rule = makeRule({ pattern: "a", replacement: "X", global: true });
		const first = applyRules("banana.md", [rule]);
		const second = applyRules("banana.md", [rule]);
		expect(first).toBe("bXnXnX");
		expect(second).toBe("bXnXnX");
		expect(second).toBe(first);
	});

	it("ignoreCase: true matches regardless of case", () => {
		const rule = makeRule({
			pattern: "note",
			replacement: "X",
			ignoreCase: true,
		});
		const result = applyRules("NOTE.md", [rule]);
		expect(result).toBe("X");
	});

	it("ignoreCase: false does not match a differently-cased pattern", () => {
		const rule = makeRule({
			pattern: "note",
			replacement: "X",
			ignoreCase: false,
		});
		// No enabled rule matches "NOTE" case-sensitively, so this falls back to the basename.
		const result = applyRules("NOTE.md", [rule]);
		expect(result).toBe("NOTE");
	});
});

describe("applyRules — fallback to basename", () => {
	it("falls back to basenameOf when no enabled rule matches at its turn", () => {
		const rule = makeRule({ pattern: "zzz-does-not-match", replacement: "X" });
		const result = applyRules("Projects/Client/index.md", [rule]);
		expect(result).toBe(basenameOf("Projects/Client/index.md"));
	});

	it("falls back to basenameOf when the final accumulator is the exact empty string", () => {
		const rule = makeRule({ pattern: "^.*$", replacement: "" });
		const result = applyRules("Projects/Client/index.md", [rule]);
		expect(result).toBe("index");
	});

	it("an empty rules array falls back to the basename", () => {
		const result = applyRules("Projects/Client/index.md", []);
		expect(result).toBe("index");
	});

	it("an array where every rule is disabled falls back to the basename", () => {
		const rule1 = makeRule({ pattern: ".*", replacement: "X", enabled: false });
		const rule2 = makeRule({ pattern: ".*", replacement: "Y", enabled: false });
		const result = applyRules("Projects/Client/index.md", [rule1, rule2]);
		expect(result).toBe("index");
	});

	it("a rule that matches and rewrites the whole accumulator to '' triggers the fallback", () => {
		const rule = makeRule({ pattern: "^note$", replacement: "" });
		const result = applyRules("note.md", [rule]);
		expect(result).toBe(basenameOf("note.md"));
		expect(result).toBe("note");
	});

	it("a match that survives one rule but is emptied by a later rule still falls back", () => {
		const shrinkToX = makeRule({ pattern: "^note$", replacement: "x" });
		const emptyX = makeRule({ pattern: "^x$", replacement: "" });
		const result = applyRules("note.md", [shrinkToX, emptyX]);
		expect(result).toBe(basenameOf("note.md"));
		expect(result).toBe("note");
	});

	it(
		// Intentional escape hatch: a whitespace-only final accumulator is NOT the empty
		// string, so it is NOT caught by the fallback. This lets a rule deliberately
		// produce a blank-looking tab label. Do not "fix" this by trimming or coercing.
		"does NOT fall back when the final accumulator is whitespace-only (deliberate escape hatch)",
		() => {
			const rule = makeRule({ pattern: "^.*$", replacement: " " });
			const result = applyRules("Projects/Client/index.md", [rule]);
			expect(result).toBe(" ");
			expect(result).not.toBe(basenameOf("Projects/Client/index.md"));
		}
	);
});

describe("applyRules — regression: unanchored vs anchored path rule", () => {
	it(
		// Decided behavior, not a bug: the unmatched "Projects/" prefix survives substring
		// replacement because the pattern only anchors the END ($), not the start. Do not
		// "fix" this to strip the whole path — an anchored pattern is the correct tool for that.
		"an unanchored rule leaves the unmatched path prefix intact",
		() => {
			const rule = makeRule({
				pattern: "([^/]+)/index$",
				replacement: "$1",
			});
			const result = applyRules("Projects/Client/index.md", [rule]);
			expect(result).toBe("Projects/Client");
		}
	);

	it("the correctly fully-anchored form strips the whole path down to the segment", () => {
		const rule = makeRule({
			pattern: "^.*?([^/]+)/index$",
			replacement: "$1",
		});
		const result = applyRules("Projects/Client/index.md", [rule]);
		expect(result).toBe("Client");
	});
});

describe("runChain — anti-drift sensor against applyRules", () => {
	it("produces the documented result for chaining, disabled rules, and every fallback path", () => {
		const cases = [
			{
				label: "chains two enabled rules, each seeing the previous rule's output",
				vaultPath: "note.md",
				rules: [
					makeRule({ pattern: "note", replacement: "draft" }),
					makeRule({ pattern: "draft", replacement: "final" }),
				],
				expected: "final",
				expectedFallback: false,
			},
			{
				label: "skips a disabled rule entirely",
				vaultPath: "note.md",
				rules: [
					makeRule({
						pattern: "note",
						replacement: "SHOULD_NOT_APPEAR",
						enabled: false,
					}),
				],
				expected: "note",
				expectedFallback: true,
			},
			{
				label: "falls back to the basename when no enabled rule matches",
				vaultPath: "Projects/Client/index.md",
				rules: [makeRule({ pattern: "zzz-does-not-match", replacement: "X" })],
				expected: basenameOf("Projects/Client/index.md"),
				expectedFallback: true,
			},
			{
				label: "falls back to the basename when the final accumulator is emptied",
				vaultPath: "note.md",
				rules: [makeRule({ pattern: "^note$", replacement: "" })],
				expected: "note",
				expectedFallback: true,
			},
			{
				label: "does not fall back on a whitespace-only final accumulator",
				vaultPath: "Projects/Client/index.md",
				rules: [makeRule({ pattern: "^.*$", replacement: " " })],
				expected: " ",
				expectedFallback: false,
			},
		];

		for (const { label, vaultPath, rules, expected, expectedFallback } of cases) {
			const trace = runChain(vaultPath, rules);
			expect(trace.result, label).toBe(expected);
			expect(trace.usedFallback, label).toBe(expectedFallback);
			// applyRules delegates straight to runChain, so this is a literal-value check
			// on the public entry point rather than a round-trip through the same call.
			expect(applyRules(vaultPath, rules), label).toBe(expected);
		}
	});
});

describe("runChain — usedFallback", () => {
	// decision: architecture/decisions/2026-08-11-grill-basename-fallback-for-unmatched-and-empty-titles.md
	it("is true when no enabled rule matches at its turn", () => {
		const rule = makeRule({ pattern: "zzz-does-not-match", replacement: "X" });
		const trace = runChain("Projects/Client/index.md", [rule]);
		expect(trace.usedFallback).toBe(true);
		expect(trace.result).toBe(basenameOf("Projects/Client/index.md"));
	});

	// decision: architecture/decisions/2026-08-11-grill-basename-fallback-for-unmatched-and-empty-titles.md
	it("is true when the final accumulator is exactly the empty string", () => {
		const rule = makeRule({ pattern: "^note$", replacement: "" });
		const trace = runChain("note.md", [rule]);
		expect(trace.usedFallback).toBe(true);
		expect(trace.result).toBe(basenameOf("note.md"));
	});

	it("is false when an enabled rule matches and leaves a non-empty result", () => {
		const rule = makeRule({ pattern: "note", replacement: "draft" });
		const trace = runChain("note.md", [rule]);
		expect(trace.usedFallback).toBe(false);
		expect(trace.result).toBe("draft");
	});
});

describe("runChain — per-step outcome", () => {
	it("marks a disabled rule's step as disabled, distinct from a rule that ran but did not match", () => {
		const disabledRule = makeRule({ pattern: "zzz", replacement: "X", enabled: false });
		const noMatchRule = makeRule({ pattern: "yyy-does-not-match", replacement: "X" });
		const trace = runChain("note.md", [disabledRule, noMatchRule]);
		expect(trace.steps[0].outcome).toBe("disabled");
		expect(trace.steps[1].outcome).toBe("no-match");
	});

	it("marks a matching enabled rule's step as applied", () => {
		const rule = makeRule({ pattern: "note", replacement: "draft" });
		const trace = runChain("note.md", [rule]);
		expect(trace.steps[0].outcome).toBe("applied");
	});
});

describe("runChain — step before/after", () => {
	it("records each step's before/after accumulator, chained from the seed", () => {
		const rule1 = makeRule({ pattern: "note", replacement: "draft" });
		const rule2 = makeRule({ pattern: "draft", replacement: "final" });
		const trace = runChain("note.md", [rule1, rule2]);
		expect(trace.seed).toBe(seedFromPath("note.md"));
		expect(trace.steps[0]).toMatchObject({ index: 0, before: "note", after: "draft" });
		expect(trace.steps[1]).toMatchObject({ index: 1, before: "draft", after: "final" });
	});

	it("identifies a rule that matched but produced no change via before === after", () => {
		const noopRule = makeRule({ pattern: "note", replacement: "note" });
		const trace = runChain("note.md", [noopRule]);
		expect(trace.steps[0].outcome).toBe("applied");
		expect(trace.steps[0].before).toBe(trace.steps[0].after);
		expect(trace.steps[0].before).toBe("note");
	});
});
