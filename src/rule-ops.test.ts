import { describe, expect, it } from "vitest";
import { createRule, moveItem } from "./rule-ops";
import { validateRule } from "./rules";

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
