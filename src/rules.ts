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

/**
 * Returns a fresh settings object on every call. Callers must not share a
 * single instance as a live default — `rules` needs its own array so that
 * mutating one caller's settings can never alias another's.
 */
export function createDefaultSettings(): TabTitleRulesSettings {
	return { rules: [], rulesRevision: 0 };
}

// Frozen so accidental mutation (e.g. `DEFAULT_SETTINGS.rules.push(...)`)
// throws instead of silently corrupting a shared constant. Live settings
// should come from createDefaultSettings() / mergeSettings(), not this.
export const DEFAULT_SETTINGS: TabTitleRulesSettings = Object.freeze({
	rules: Object.freeze([] as Rule[]),
	rulesRevision: 0,
}) as TabTitleRulesSettings;

export type RuleValidation = { ok: true } | { ok: false; error: string };

export function flagsOf(rule: Rule): string {
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

/**
 * Sanitizes a single stored rule: an enabled rule whose pattern no longer
 * compiles is forced to enabled: false (never dropped) so the data survives
 * for a future UI to surface as broken, and a console.warn names it.
 */
function sanitizeRule(rule: Rule): Rule {
	if (rule.enabled && !validateRule(rule).ok) {
		console.warn(
			`Tab Title Rules: rule "${rule.name ?? rule.id}" has an invalid pattern and was disabled.`,
			rule.pattern
		);
		return { ...rule, enabled: false };
	}
	return { ...rule };
}

/**
 * Merges persisted (untrusted) data over a fresh default settings object.
 * Pure and Obsidian-free so it is directly testable: this is the save-time
 * boundary that lets applyRules() assume every enabled rule it sees compiles.
 */
export function mergeSettings(raw: unknown): TabTitleRulesSettings {
	const merged = createDefaultSettings();
	if (raw && typeof raw === "object") {
		const data = raw as Partial<TabTitleRulesSettings>;
		if (typeof data.rulesRevision === "number") {
			merged.rulesRevision = data.rulesRevision;
		}
		if (Array.isArray(data.rules)) {
			merged.rules = data.rules.map(sanitizeRule);
		}
	}
	return merged;
}

/** Returns a new settings object with rulesRevision incremented by one. */
export function bumpRevision(
	settings: TabTitleRulesSettings
): TabTitleRulesSettings {
	return { ...settings, rulesRevision: settings.rulesRevision + 1 };
}
