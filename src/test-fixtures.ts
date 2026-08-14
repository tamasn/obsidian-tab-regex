import type { Rule } from "./rules";

let ruleCounter = 0;

export function makeRule(overrides: Partial<Rule> = {}): Rule {
	ruleCounter += 1;
	return {
		id: `rule-${ruleCounter}`,
		name: undefined,
		pattern: "a",
		replacement: "b",
		global: false,
		ignoreCase: false,
		enabled: true,
		...overrides,
	};
}
