import type { Rule } from "./rules";
import { flagsOf, validateRule } from "./rules";

/**
 * Row label fallback chain: name, then pattern, then a fixed placeholder.
 */
export function ruleRowLabel(rule: Rule): string {
	// gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md
	// A coerced/fresh rule can carry an empty pattern, so the placeholder guards against
	// rendering a blank label.
	return rule.name || rule.pattern || "New rule";
}

/**
 * No `(off) ` prefix for a disabled rule: the row carries its own enable
 * toggle, so encoding enablement in the summary text would duplicate it.
 */
export function formatRuleSummary(rule: Rule): string {
	return `/${rule.pattern}/${flagsOf(rule)} → ${rule.replacement}`;
}

/**
 * Wraps validateRule — the single pattern-acceptability gate (architecture/constitution.md,
 * "validateRule is the only pattern-acceptability gate") — for the modal's pattern-error
 * display. Takes the rule as given rather than a separate candidate pattern: by the time
 * the modal calls this, its draft's pattern field already holds the candidate value (see
 * rule-modal.ts's reportPatternError), so there is nothing left to compose.
 */
export function rulePatternError(rule: Rule): string | null {
	const result = validateRule(rule);
	return result.ok ? null : result.error;
}
