import type { Rule } from "./rules";

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
 * empty pattern (gotcha: architecture/gotchas/2026-08-12-work-coerced-placeholder-empty-pattern-matches-everything.md).
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
