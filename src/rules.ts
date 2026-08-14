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
	// gotcha: architecture/gotchas/2026-08-12-work-coerced-placeholder-empty-pattern-matches-everything.md
	// An empty pattern compiles to /(?:)/, matching every position, so an enabled empty-pattern
	// rule always "matches" and suppresses the basename fallback. Reject here, at the single
	// validation gate, so both entry points (the coerced placeholder and a fully-shaped
	// {pattern: "", enabled: true} rule that passes isRule) are closed.
	if (rule.pattern === "") {
		return { ok: false, error: "Pattern must not be empty." };
	}
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Full shape check: every field present with its expected type. */
function isRule(value: unknown): value is Rule {
	return (
		isPlainObject(value) &&
		typeof value.id === "string" &&
		typeof value.pattern === "string" &&
		typeof value.replacement === "string" &&
		typeof value.global === "boolean" &&
		typeof value.ignoreCase === "boolean" &&
		typeof value.enabled === "boolean" &&
		(value.name === undefined || typeof value.name === "string")
	);
}

/**
 * Recovers a persisted rule element that failed `isRule`. Object-shaped
 * elements are coerced into a disabled placeholder (missing/mistyped fields
 * get safe defaults) so the data is never silently dropped, consistent with
 * sanitizeRule's never-drop policy for a rule that merely fails to compile.
 * Non-object elements (null, a bare string/number, an array, ...) carry
 * nothing worth keeping and are skipped.
 */
function coerceRule(value: unknown, index: number): Rule | null {
	if (!isPlainObject(value)) {
		console.warn(
			`Tab Title Rules: dropped a malformed rule at index ${index} (expected an object, got ${
				value === null ? "null" : typeof value
			}).`,
			value
		);
		return null;
	}
	const id = typeof value.id === "string" ? value.id : `invalid-rule-${index}`;
	console.warn(
		`Tab Title Rules: rule "${id}" has an invalid shape and was coerced to a disabled placeholder.`,
		value
	);
	return {
		id,
		name: typeof value.name === "string" ? value.name : undefined,
		pattern: typeof value.pattern === "string" ? value.pattern : "",
		replacement: typeof value.replacement === "string" ? value.replacement : "",
		global: typeof value.global === "boolean" ? value.global : false,
		ignoreCase: typeof value.ignoreCase === "boolean" ? value.ignoreCase : false,
		enabled: false,
	};
}

/**
 * Merges persisted (untrusted) data over a fresh default settings object.
 * Pure and Obsidian-free so it is directly testable: this is the load-time
 * boundary that lets applyRules() assume every enabled rule it sees compiles.
 * The save-side counterpart is validateRule, invoked from the not-yet-built
 * settings UI.
 */
export function mergeSettings(raw: unknown): TabTitleRulesSettings {
	const merged = createDefaultSettings();
	if (raw && typeof raw === "object") {
		const data = raw as Partial<TabTitleRulesSettings>;
		if (typeof data.rulesRevision === "number") {
			merged.rulesRevision = data.rulesRevision;
		}
		if (Array.isArray(data.rules)) {
			merged.rules = data.rules
				.map((entry, index) => (isRule(entry) ? entry : coerceRule(entry, index)))
				.filter((rule): rule is Rule => rule !== null)
				.map(sanitizeRule);
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
