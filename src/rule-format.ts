import type { Rule } from "./rules";
import { flagsOf, validateRule } from "./rules";

/**
 * Row label fallback chain: name, then pattern, then a fixed placeholder.
 * A coerced/fresh rule can carry an empty pattern (gotcha:
 * architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md),
 * so the placeholder guards against rendering a blank label.
 */
export function ruleRowLabel(rule: Rule): string {
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
 * Validates a candidate pattern against the rule's own flags via validateRule,
 * the single pattern-acceptability gate (architecture/constitution.md:18-22).
 */
export function rulePatternError(rule: Rule, candidatePattern: string): string | null {
	const result = validateRule({ ...rule, pattern: candidatePattern });
	return result.ok ? null : result.error;
}
