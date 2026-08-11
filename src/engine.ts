import type { Rule } from "./rules";

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

function flagsOf(rule: Rule): string {
	return `${rule.global ? "g" : ""}${rule.ignoreCase ? "i" : ""}`;
}

export function applyRules(vaultPath: string, rules: Rule[]): string {
	let acc = seedFromPath(vaultPath);
	let matched = false;

	for (const rule of rules) {
		if (!rule.enabled) continue;

		// Fresh RegExp instances per rule per call: a `g`-flagged RegExp is stateful
		// (lastIndex), so reusing one across calls or across test/replace would leak
		// state and either corrupt the replace or skip matches on the next call.
		const flags = flagsOf(rule);
		const testRegex = new RegExp(rule.pattern, flags);
		if (!testRegex.test(acc)) continue;

		matched = true;
		const replaceRegex = new RegExp(rule.pattern, flags);
		acc = acc.replace(replaceRegex, rule.replacement);
	}

	if (!matched || acc === "") {
		return basenameOf(vaultPath);
	}

	return acc;
}
