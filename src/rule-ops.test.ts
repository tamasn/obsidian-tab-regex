import { describe, expect, it } from "vitest";
import { applyRuleEnabled, createRule, moveItem, replaceRuleById } from "./rule-ops";
import { validateRule } from "./rules";
import { makeRule } from "./test-fixtures";

describe("moveItem", () => {
	const list = ["A", "B", "C", "D"];

	it("moving an item down lands it after the target index", () => {
		// convention: `to` is the item's index in the final array, after removal.
		const result = moveItem(list, 0, 2);
		expect(result).toEqual(["B", "C", "A", "D"]);
	});

	it("moving an item up lands it before the target index", () => {
		const result = moveItem(list, 3, 1);
		expect(result).toEqual(["A", "D", "B", "C"]);
	});

	it("returns a new array rather than the same reference", () => {
		const result = moveItem(list, 0, 2);
		expect(result).not.toBe(list);
	});

	it("does not mutate the input array", () => {
		const original = [...list];
		moveItem(list, 0, 2);
		expect(list).toEqual(original);
	});

	it("is a no-op, returning an equal array, when from and to are the same index", () => {
		const result = moveItem(list, 1, 1);
		expect(result).toEqual(list);
	});

	it("is a no-op when to is out of range above the list length", () => {
		const result = moveItem(list, 0, 99);
		expect(result).toEqual(list);
	});

	it("is a no-op when to is out of range below zero", () => {
		const result = moveItem(list, 0, -1);
		expect(result).toEqual(list);
	});

	it("is a no-op when from is out of range", () => {
		const result = moveItem(list, 99, 0);
		expect(result).toEqual(list);
	});
});

describe("createRule", () => {
	it("produces a distinct id on every call", () => {
		const a = createRule();
		const b = createRule();
		expect(a.id).not.toBe(b.id);
	});

	it("is born disabled with an empty pattern", () => {
		const rule = createRule();
		expect(rule.enabled).toBe(false);
		expect(rule.pattern).toBe("");
	});

	// Ties the "add rule" affordance to validateRule's empty-pattern rejection: a freshly
	// added rule cannot be enabled until the user gives it a real pattern.
	// gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md
	it("cannot be enabled until given a real pattern — validateRule rejects the fresh rule", () => {
		const result = validateRule(createRule());
		expect(result.ok).toBe(false);
	});
});

describe("applyRuleEnabled", () => {
	// architecture/constitution.md, "validateRule is the only pattern-acceptability gate":
	// applyRuleEnabled (rule-ops.ts) is itself the enable-integrity gate — settings-tab.ts's
	// setRuleEnabled calls it as a best-effort resync, while mergeSettings remains the
	// authoritative gate on the save path — never enable a rule whose pattern does not validate.
	// Disabling is always allowed, since an invalid rule must stay reachable to disable
	// (gotcha: architecture/gotchas/2026-08-18-OTR-0006-savepreferences-bypasses-the-mergesettings-integrity-gate.md
	// records that this.settings can legitimately hold an enabled non-compiling rule mid-edit).
	it("gates enabling on validity, always allows disabling, and is a no-op for a missing id", () => {
		const validRule = makeRule({ pattern: "ok", enabled: false });
		// Split disabled/enabled, rather than one shared invalidRule: the "rejected" case below
		// starts disabled so a reject path that wrongly flips `enabled` to true in place is a
		// real, sensed value change — starting it already enabled (the value the reject-path bug
		// would also write) would make that mutation invisible to before/after equality.
		const disabledInvalidRule = makeRule({ pattern: "(", enabled: false });
		const enabledInvalidRule = makeRule({ pattern: "(", enabled: true });

		const cases = [
			{
				label: "enabling an invalid rule is rejected without mutating",
				rules: [disabledInvalidRule],
				id: disabledInvalidRule.id,
				next: true,
				expectedKind: "rejected" as const,
			},
			{
				label: "disabling an invalid rule is allowed",
				rules: [enabledInvalidRule],
				id: enabledInvalidRule.id,
				next: false,
				expectedKind: "applied" as const,
			},
			{
				label: "enabling a valid rule works",
				rules: [validRule],
				id: validRule.id,
				next: true,
				expectedKind: "applied" as const,
			},
			{
				label: "an id absent from the array is not-found, without mutating",
				rules: [validRule],
				id: "missing-id",
				next: true,
				expectedKind: "not-found" as const,
			},
		];

		for (const { label, rules, id, next, expectedKind } of cases) {
			// Deep-cloned, not a shallow `[...rules]` copy: a shallow copy shares the same
			// element references as `rules`, so an in-place mutation of an element mutates
			// this "before" snapshot too and the toEqual below can never see it. applyRuleEnabled
			// always returns a copy on every branch (applied, rejected, not-found), so the input
			// array must come out identical to this independent snapshot regardless of outcome.
			const before = structuredClone(rules);
			const result = applyRuleEnabled(rules, id, next);
			expect(result.kind, label).toBe(expectedKind);
			expect(rules, label).toEqual(before);
			if (result.kind === "applied") {
				const updated = result.rules.find((rule) => rule.id === id);
				expect(updated?.enabled, label).toBe(next);
			}
		}
	});
});

describe("replaceRuleById", () => {
	it("replaces the rule at the matching id's index, leaving the rest of the array untouched", () => {
		const a = makeRule({ pattern: "a" });
		const b = makeRule({ pattern: "b" });
		const c = makeRule({ pattern: "c" });
		const replacement = { ...b, pattern: "b2" };

		const result = replaceRuleById([a, b, c], b.id, replacement);

		expect(result).toEqual([a, replacement, c]);
	});

	it("does not mutate the input array", () => {
		const a = makeRule({ pattern: "a" });
		const original = [a];

		replaceRuleById(original, a.id, { ...a, pattern: "a2" });

		expect(original[0].pattern).toBe("a");
	});

	it("is a no-op — returns null — when the id is not present", () => {
		const a = makeRule({ pattern: "a" });

		const result = replaceRuleById([a], "missing-id", makeRule({ pattern: "z" }));

		expect(result).toBeNull();
	});
});
