import { validateRule, type Rule } from "./rules";
import { runChain, type StepOutcome } from "./engine";

// anchor: architecture/gotchas/2026-08-11-grill-catastrophic-backtracking-freezes-ui-on-hot-path.md
// Bounds the length of the seeded input only. It does NOT bound backtracking cost:
// catastrophic backtracking is exponential in input length, not linear, so a pathological
// pattern can still freeze the UI well within this cap ((.+)+# measured at 136ms at 24
// chars, 2.2s at 28, 35.7s at 32 - all under 256). That exposure remains unmitigated on
// this hot path; see the gotcha doc.
const MAX_SAMPLE_LENGTH = 256;

export interface PreviewRow {
	index: number;
	outcome: StepOutcome | "invalid";
	before: string;
	after: string;
}

export interface Preview {
	sample: string;
	rows: PreviewRow[];
	result: string;
	usedFallback: boolean;
	looksLikePathFragment: boolean;
}

/**
 * Drives the settings UI's live preview through the same runChain walker used by
 * the tab-title path (applyRules), so the two can never drift apart. A rule that
 * fails validateRule is neutralized (disabled) before runChain ever sees it, so
 * the chain never compiles a broken pattern; its row is re-labelled "invalid"
 * afterward, staying index-aligned 1:1 with the input rules array.
 */
export function buildPreview(samplePath: string, rules: Rule[]): Preview {
	const sample = samplePath.slice(0, MAX_SAMPLE_LENGTH);

	const validity = rules.map((rule) => validateRule(rule).ok);
	const safeRules = rules.map((rule, index) =>
		validity[index] ? rule : { ...rule, enabled: false }
	);

	const trace = runChain(sample, safeRules);

	const rows: PreviewRow[] = trace.steps.map((step) => ({
		index: step.index,
		outcome: validity[step.index] ? step.outcome : "invalid",
		before: step.before,
		after: step.after,
	}));

	return {
		sample,
		rows,
		result: trace.result,
		usedFallback: trace.usedFallback,
		// anchor: architecture/gotchas/2026-08-11-grill-unanchored-path-rule-leaves-path-fragments.md
		// Visible sensor for a rule that leaves a path separator in the final result: silently
		// wrong output with no error anywhere else.
		looksLikePathFragment: trace.result.includes("/"),
	};
}
