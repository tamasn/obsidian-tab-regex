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
			// `matched` and `acc` are deliberately left untouched here, so a non-compiling
			// rule is indistinguishable from a rule that ran and did not match for the
			// usedFallback computation below (usedFallback = !matched || acc === "").
			// No warning: this is the tab-title hot path, and TitleCache clears wholesale
			// on every revision bump, so a burst of keystrokes would emit one warning per
			// open tab per invalid rule. sanitizeRule (src/rules.ts:69-78) already warns
			// once at the load boundary. This guard is compile-only, so validateRule's
			// empty-pattern rejection (src/rules.ts:50-52) and the preview's
			// pre-neutralization (src/preview.ts:37-40) remain necessary.
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
