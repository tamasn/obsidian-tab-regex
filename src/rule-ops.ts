import type { Rule } from "./rules";
import { validateRule } from "./rules";

/**
 * Pure, non-mutating move: `to` is the moved item's index in the final array
 * (after removal), not its insertion offset into the pre-removal array.
 * A no-op (from === to, or either index out of range) returns a new array
 * equal to the input rather than mutating or throwing.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
	if (
		from < 0 ||
		from >= list.length ||
		to < 0 ||
		to >= list.length ||
		from === to
	) {
		return [...list];
	}
	const copy = [...list];
	const [item] = copy.splice(from, 1);
	copy.splice(to, 0, item);
	return copy;
}

/**
 * A freshly added rule starts disabled with an empty pattern, so it cannot be
 * enabled until the user supplies a real pattern — validateRule rejects an
 * empty pattern (gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md).
 * No `obsidian` import here: this module stays plain-TypeScript so it is
 * directly unit-testable.
 */
export function createRule(): Rule {
	return {
		id: crypto.randomUUID(),
		pattern: "",
		replacement: "",
		global: false,
		ignoreCase: false,
		enabled: false,
	};
}

export type ApplyRuleEnabledResult =
	| { kind: "applied"; rules: Rule[] }
	| { kind: "rejected" }
	| { kind: "not-found" };

/**
 * Enable-integrity gate: never enable a rule whose pattern does not validate
 * (mergeSettings remains the authoritative gate on the save path; this is the
 * settings-tab's own best-effort resync — see settings-tab.ts's setRuleEnabled
 * doc comment). Disabling is always allowed regardless of validity. Finds and
 * validates the rule once, rather than the id being re-resolved by separate
 * find/validate/splice passes.
 */
export function applyRuleEnabled(
	rules: readonly Rule[],
	id: string,
	next: boolean
): ApplyRuleEnabledResult {
	const index = rules.findIndex((rule) => rule.id === id);
	if (index === -1) return { kind: "not-found" };
	const rule = rules[index];
	if (next && !validateRule(rule).ok) return { kind: "rejected" };
	const copy = [...rules];
	copy[index] = { ...rule, enabled: next };
	return { kind: "applied", rules: copy };
}

/**
 * Replaces the rule with the given id (the modal-commit splice). Returns
 * `null` — rather than a copy equal to the input — when the id is not found,
 * so a caller that persists/refreshes only on an actual change can tell a
 * genuine replacement apart from a no-op (e.g. the rule was deleted while its
 * edit modal was still open).
 */
export function replaceRuleById(rules: readonly Rule[], id: string, next: Rule): Rule[] | null {
	const index = rules.findIndex((rule) => rule.id === id);
	if (index === -1) return null;
	const copy = [...rules];
	copy[index] = next;
	return copy;
}
