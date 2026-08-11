export interface Rule {
	id: string;
	name?: string;
	pattern: string;
	replacement: string;
	global: boolean;
	ignoreCase: boolean;
	enabled: boolean;
}

export interface TabTitleRulesSettings {
	rules: Rule[];
	rulesRevision: number;
}

export const DEFAULT_SETTINGS: TabTitleRulesSettings = {
	rules: [],
	rulesRevision: 0,
};

export type RuleValidation = { ok: true } | { ok: false; error: string };

function flagsOf(rule: Rule): string {
	return `${rule.global ? "g" : ""}${rule.ignoreCase ? "i" : ""}`;
}

export function validateRule(rule: Rule): RuleValidation {
	try {
		new RegExp(rule.pattern, flagsOf(rule));
		return { ok: true };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
