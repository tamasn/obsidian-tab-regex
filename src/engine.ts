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

export function applyRules(vaultPath: string, rules: Rule[]): string {
	let acc = seedFromPath(vaultPath);
	let matched = false;

	for (const rule of rules) {
		if (!rule.enabled) continue;

		// A single compiled RegExp is reused for both test() and replace() below.
		// This is safe even when `global` is set: RegExp.prototype[Symbol.replace]
		// resets lastIndex to 0 before it starts matching whenever the regex is
		// global, so test()'s lastIndex advancement never leaks into replace() (or
		// into the next call, since a fresh RegExp is compiled per rule per call).
		const regex = new RegExp(rule.pattern, flagsOf(rule));
		if (!regex.test(acc)) continue;

		matched = true;
		acc = acc.replace(regex, rule.replacement);
	}

	if (!matched || acc === "") {
		return basenameOf(vaultPath);
	}

	return acc;
}
