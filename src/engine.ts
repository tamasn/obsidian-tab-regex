import { flagsOf, type Rule } from "./rules";

export function seedFromPath(vaultPath: string): string {
	const lastSlash = vaultPath.lastIndexOf("/");
	const dir = lastSlash === -1 ? "" : vaultPath.slice(0, lastSlash + 1);
	const filename = lastSlash === -1 ? vaultPath : vaultPath.slice(lastSlash + 1);
	const lastDot = filename.lastIndexOf(".");
	// lastDot <= 0 covers both "no dot at all" and a leading-dot filename with no
	// other dot (e.g. ".hidden"), neither of which has an extension to strip.
	if (lastDot <= 0) return vaultPath;
	return dir + filename.slice(0, lastDot);
}

export function basenameOf(vaultPath: string): string {
	const seeded = seedFromPath(vaultPath);
	const lastSlash = seeded.lastIndexOf("/");
	return lastSlash === -1 ? seeded : seeded.slice(lastSlash + 1);
}

export type StepOutcome = "disabled" | "no-match" | "applied" | "invalid";

export interface RuleStep {
	index: number;
	before: string;
	after: string;
	outcome: StepOutcome;
}

export interface ChainTrace {
	seed: string;
	steps: RuleStep[];
	result: string;
	usedFallback: boolean;
}

/**
 * The single walker for the rule chain: both the tab-title path (applyRules)
 * and the settings UI's live preview drive through this so they can never
 * drift apart.
 */
export function runChain(vaultPath: string, rules: Rule[]): ChainTrace {
	const seed = seedFromPath(vaultPath);
	let acc = seed;
	let matched = false;
	const steps: RuleStep[] = [];

	for (let index = 0; index < rules.length; index++) {
		const rule = rules[index];
		const before = acc;

		if (!rule.enabled) {
			steps.push({ index, before, after: before, outcome: "disabled" });
			continue;
		}

		// A single compiled RegExp is reused for both test() and replace() below.
		// This is safe even when `global` is set: RegExp.prototype[Symbol.replace]
		// resets lastIndex to 0 before it starts matching whenever the regex is
		// global, so test()'s lastIndex advancement never leaks into replace() (or
		// into the next call, since a fresh RegExp is compiled per rule per call).
		let regex: RegExp;
		try {
			regex = new RegExp(rule.pattern, flagsOf(rule));
		} catch {
			// INVARIANT: this `try` must stay scoped to the `new RegExp` compile above and
			// must never be widened to also cover test()/replace() below. A throw between
			// `matched = true` and the `acc` reassignment would leave `matched` set with a
			// stale `acc`, silently suppressing the basename fallback and shipping a wrong
			// title — that failure mode, not merely "what does this catch", is why the try
			// stops here.
			//
			// `matched` and `acc` are deliberately left untouched here, so a non-compiling
			// rule is indistinguishable from a rule that ran and did not match for the
			// usedFallback computation below (usedFallback = !matched || acc === "").
			// No warning: this is the tab-title hot path. The exposure this avoids is
			// narrower than "one warning per open tab per invalid rule" — mergeSettings (in
			// src/rules.ts), which runs sanitizeRule and disables an invalid-pattern rule,
			// always finishes and lands on this.settings before the rulesRevision bump it
			// produces becomes visible, so a wholesale TitleCache clear triggered by that
			// bump can never itself be racing an enabled invalid rule; the only real
			// exposure is an uncached render reading the rule during the pre-persist window
			// before that save completes. sanitizeRule already warns whenever mergeSettings
			// runs, which is on every load and every saveSettings call, not load only. This
			// guard is compile-only, so validateRule's empty-pattern rejection and
			// buildPreview's pre-neutralization (in src/preview.ts) remain necessary.
			steps.push({ index, before, after: before, outcome: "invalid" });
			continue;
		}
		if (!regex.test(before)) {
			steps.push({ index, before, after: before, outcome: "no-match" });
			continue;
		}

		matched = true;
		acc = before.replace(regex, rule.replacement);
		steps.push({ index, before, after: acc, outcome: "applied" });
	}

	const usedFallback = !matched || acc === "";
	const result = usedFallback ? basenameOf(vaultPath) : acc;

	return { seed, steps, result, usedFallback };
}

export function applyRules(vaultPath: string, rules: Rule[]): string {
	return runChain(vaultPath, rules).result;
}
