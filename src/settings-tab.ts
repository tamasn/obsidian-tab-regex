import { App, PluginSettingTab } from "obsidian";
import type {
	SettingDefinitionItem,
	SettingDefinitionList,
	SettingDefinitionPage,
	SettingDefinitionRender,
} from "obsidian";
import { DEFAULT_SAMPLE_PATH, flagsOf, validateRule, type Rule } from "./rules";
import { createRule, moveItem } from "./rule-ops";
import { buildPreview, type Preview } from "./preview";
import type TabTitleRulesPlugin from "./main";

const RULES_PERSIST_DEBOUNCE_MS = 400;
const SAMPLE_PERSIST_DEBOUNCE_MS = 400;
const PREVIEW_RENDER_DEBOUNCE_MS = 200;
const DEFINITIONS_UPDATE_DEBOUNCE_MS = 400;

type RuleField = "name" | "pattern" | "replacement" | "global" | "ignoreCase" | "enabled";

const RULE_KEY_PREFIX = "rule:";

function ruleControlKey(ruleId: string, field: RuleField): string {
	return `${RULE_KEY_PREFIX}${ruleId}:${field}`;
}

function parseRuleControlKey(key: string): { ruleId: string; field: RuleField } | undefined {
	if (!key.startsWith(RULE_KEY_PREFIX)) return undefined;
	const rest = key.slice(RULE_KEY_PREFIX.length);
	const separatorIndex = rest.lastIndexOf(":");
	if (separatorIndex === -1) return undefined;
	return {
		ruleId: rest.slice(0, separatorIndex),
		field: rest.slice(separatorIndex + 1) as RuleField,
	};
}

export class TabTitleRulesSettingTab extends PluginSettingTab {
	plugin: TabTitleRulesPlugin;

	private rulesPersistTimer: number | undefined;
	private samplePersistTimer: number | undefined;
	private previewRenderTimer: number | undefined;
	private definitionsUpdateTimer: number | undefined;
	private previewOutputEl: HTMLElement | undefined;
	private previewSignature: string | undefined;
	private previewCache: Preview | undefined;

	constructor(app: App, plugin: TabTitleRulesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [this.buildRulesListDefinition(), this.buildPreviewDefinition()];
	}

	getControlValue(key: string): unknown {
		const parsed = parseRuleControlKey(key);
		if (parsed === undefined) return super.getControlValue(key);
		const rule = this.findRule(parsed.ruleId);
		if (rule === undefined) return undefined;
		switch (parsed.field) {
			case "name":
				return rule.name ?? "";
			case "pattern":
				return rule.pattern;
			case "replacement":
				return rule.replacement;
			case "global":
				return rule.global;
			case "ignoreCase":
				return rule.ignoreCase;
			case "enabled":
				return rule.enabled;
			default:
				return undefined;
		}
	}

	setControlValue(key: string, value: unknown): void {
		const parsed = parseRuleControlKey(key);
		if (parsed === undefined) {
			// Base impl mutates and persists plugin settings and may reject; a bare
			// `void` would drop that as an unhandled rejection.
			Promise.resolve(super.setControlValue(key, value)).catch((error: unknown) => {
				console.error("obsidian-tab-regex: setControlValue failed", key, error);
			});
			return;
		}
		const index = this.plugin.settings.rules.findIndex((rule) => rule.id === parsed.ruleId);
		if (index === -1) return;
		const rule = this.plugin.settings.rules[index];

		let nextRule: Rule;
		switch (parsed.field) {
			case "name": {
				const name = typeof value === "string" ? value : "";
				nextRule = { ...rule, name: name === "" ? undefined : name };
				break;
			}
			case "pattern":
				nextRule = { ...rule, pattern: typeof value === "string" ? value : rule.pattern };
				break;
			case "replacement":
				nextRule = { ...rule, replacement: typeof value === "string" ? value : rule.replacement };
				break;
			case "global":
				nextRule = { ...rule, global: Boolean(value) };
				break;
			case "ignoreCase":
				nextRule = { ...rule, ignoreCase: Boolean(value) };
				break;
			case "enabled": {
				// Save-side integrity gate: mirrors the toggle's own `disabled` predicate so
				// any write path that bypasses the DOM (keyboard activation, a future
				// framework change, ...) still can't enable an invalid-pattern rule.
				const enabled = Boolean(value);
				if (enabled && !this.isRuleValid(parsed.ruleId)) {
					// Reject without mutating. The toggle may already have flipped
					// optimistically (e.g. keyboard activation bypassing its own
					// `disabled` predicate); resyncing its displayed value needs a
					// re-render — getControlValue() is only re-read on render, and
					// refreshDomState() only re-evaluates `visible`/`disabled` predicates,
					// it cannot touch a control's value. Route through the same debounced,
					// focus-aware scheduler used for list-entry refresh.
					this.scheduleDefinitionsUpdate();
					return;
				}
				nextRule = { ...rule, enabled };
				break;
			}
			default:
				return;
		}

		const rules = [...this.plugin.settings.rules];
		rules[index] = nextRule;
		this.commitRules(rules);

		if (parsed.field === "pattern" || parsed.field === "global" || parsed.field === "ignoreCase") {
			this.refreshDomState();
		}
		// Per obsidian.d.ts, SettingDefinitionPage.displayValue and .status carry only
		// "call update() to refresh" — unlike `disabled`/`visible`, they are not
		// re-evaluated on render. `name` is a plain `string` snapshotted when
		// buildRulePage() runs. All three (used here via summarizeRule/isRuleValid/name)
		// go stale without a rebuild, so every field schedules one; the focus-aware
		// deferral in scheduleDefinitionsUpdate() keeps that from stealing focus/caret
		// while a text control is active.
		this.scheduleDefinitionsUpdate();
		this.schedulePreviewRefresh();
	}

	hide(): void {
		// Flush once: saveSettings() and savePreferences() write the identical settings
		// object, so firing both back to back is a redundant, unserialized double write.
		// saveSettings() also bumps the revision, so it takes priority when both timers
		// are pending.
		const rulesPending = this.rulesPersistTimer !== undefined;
		const samplePending = this.samplePersistTimer !== undefined;
		if (rulesPending) {
			window.clearTimeout(this.rulesPersistTimer);
			this.rulesPersistTimer = undefined;
		}
		if (samplePending) {
			window.clearTimeout(this.samplePersistTimer);
			this.samplePersistTimer = undefined;
		}
		if (rulesPending) {
			void this.plugin.saveSettings();
		} else if (samplePending) {
			void this.plugin.savePreferences();
		}
		// Drop rather than flush: update() has no persistent effect, and this tab is being
		// torn down — display() rebuilds getSettingDefinitions() from scratch on next open
		// regardless, so calling update() here would only re-enter the (also-tearing-down)
		// preview render callback for no visible benefit.
		if (this.definitionsUpdateTimer !== undefined) {
			window.clearTimeout(this.definitionsUpdateTimer);
			this.definitionsUpdateTimer = undefined;
		}
		if (this.previewRenderTimer !== undefined) {
			window.clearTimeout(this.previewRenderTimer);
			this.previewRenderTimer = undefined;
		}
		this.previewOutputEl = undefined;
		super.hide();
	}

	// --- rule list -----------------------------------------------------

	private buildRulesListDefinition(): SettingDefinitionList {
		return {
			type: "list",
			heading: "Rules",
			items: this.plugin.settings.rules.map((rule) => this.buildRulePage(rule)),
			emptyState: "No rules defined yet. Use the + button to add one.",
			onReorder: (oldIndex, newIndex) => {
				// moveItem uses the after-removal convention for `newIndex`; unconfirmed
				// against Obsidian's actual drag behavior, see task notes.
				this.commitRules(moveItem(this.plugin.settings.rules, oldIndex, newIndex));
				this.schedulePreviewRefresh();
				this.update();
			},
			onDelete: (index) => {
				const rules = [...this.plugin.settings.rules];
				rules.splice(index, 1);
				this.commitRules(rules);
				this.schedulePreviewRefresh();
				this.update();
			},
			addItem: {
				name: "Add rule",
				action: () => {
					this.commitRules([...this.plugin.settings.rules, createRule()]);
					this.schedulePreviewRefresh();
					this.update();
				},
			},
		};
	}

	private buildRulePage(rule: Rule): SettingDefinitionPage {
		return {
			type: "page",
			name: rule.name || rule.pattern || "New rule",
			displayValue: () => this.summarizeRule(rule.id),
			status: () => (this.isRuleValid(rule.id) ? null : "warning"),
			items: [
				{
					name: "Name",
					desc: "Optional label shown in the rule list.",
					control: {
						type: "text",
						key: ruleControlKey(rule.id, "name"),
						placeholder: "Rule name",
					},
				},
				{
					name: "Pattern",
					desc: "Regular expression tested against the path (extension stripped).",
					control: {
						type: "text",
						key: ruleControlKey(rule.id, "pattern"),
						placeholder: "e.g. ^Projects/(.+)$",
						validate: (value) => {
							const current = this.findRule(rule.id);
							if (current === undefined) return undefined;
							const result = validateRule({ ...current, pattern: value });
							return result.ok ? undefined : result.error;
						},
					},
				},
				{
					name: "Replacement",
					desc: "Replacement text; may reference capture groups ($1, $2, ...).",
					control: {
						type: "text",
						key: ruleControlKey(rule.id, "replacement"),
					},
				},
				{
					name: "Global (g)",
					desc: "Replace every match instead of only the first.",
					control: {
						type: "toggle",
						key: ruleControlKey(rule.id, "global"),
					},
				},
				{
					name: "Ignore case (i)",
					desc: "Match without regard to letter case.",
					control: {
						type: "toggle",
						key: ruleControlKey(rule.id, "ignoreCase"),
					},
				},
				{
					name: "Enabled",
					desc: "Include this rule in the chain. Locked while the pattern is invalid.",
					control: {
						type: "toggle",
						key: ruleControlKey(rule.id, "enabled"),
						disabled: () => !this.isRuleValid(rule.id),
					},
				},
			],
		};
	}

	private findRule(id: string): Rule | undefined {
		return this.plugin.settings.rules.find((rule) => rule.id === id);
	}

	private isRuleValid(id: string): boolean {
		const rule = this.findRule(id);
		return rule !== undefined && validateRule(rule).ok;
	}

	private summarizeRule(id: string): string {
		const rule = this.findRule(id);
		if (rule === undefined) return "";
		// SettingDefinitionPage has no control slot on the list entry itself, so fold
		// enabled state into the one text surface the entry exposes.
		const offPrefix = rule.enabled ? "" : "(off) ";
		return `${offPrefix}/${rule.pattern}/${flagsOf(rule)} → ${rule.replacement}`;
	}

	/**
	 * Debounced update(), triggered by every field edit (see call sites in
	 * setControlValue(), including the enabled-toggle reject path). Per obsidian.d.ts,
	 * `displayValue`/`status`/`name` on SettingDefinitionPage all require update() to
	 * refresh — none re-evaluate on render the way `disabled`/`visible` do — so any
	 * field's edit can leave the list entry stale. update() re-renders the definitions
	 * structurally, so calling it while a text control has focus would steal that focus
	 * (and the caret, mid-edit). The timer callback defers rather than firing whenever
	 * the active element is a text-entry control inside this tab's containerEl, and
	 * reschedules itself so the pending update is never dropped, only postponed — it
	 * lands the moment focus leaves the field, which is necessarily before the user can
	 * navigate back to the list and see a stale entry. Not flushed in hide() — see there
	 * for why (a fresh display() rebuilds definitions from scratch regardless).
	 */
	private scheduleDefinitionsUpdate(): void {
		if (this.definitionsUpdateTimer !== undefined) {
			window.clearTimeout(this.definitionsUpdateTimer);
		}
		this.definitionsUpdateTimer = window.setTimeout(() => {
			if (this.isTextEntryFocused()) {
				this.scheduleDefinitionsUpdate();
				return;
			}
			this.definitionsUpdateTimer = undefined;
			this.update();
		}, DEFINITIONS_UPDATE_DEBOUNCE_MS);
	}

	/**
	 * True when focus is on a text-entry control (input, textarea, or
	 * contenteditable) inside this tab's own containerEl — checked against the tab's
	 * container rather than the whole document, so focus elsewhere in the app (or in a
	 * different, unrelated settings tab) doesn't defer this tab's refresh. Reads
	 * containerEl.doc (the document this tab's own elements belong to) rather than the
	 * global `document`, and uses Node.instanceOf rather than plain `instanceof`,
	 * because a popout window's elements live in that window's own document and JS
	 * realm: the global document never reports them focused, and their constructors
	 * fail a same-realm `instanceof` against this window's HTMLElement/HTMLInputElement
	 * classes even when they are. Checks the focused input's `type` rather than
	 * treating every HTMLInputElement as text entry, because non-text inputs (e.g. the
	 * enable toggle's checkbox) have no caret to lose — updating while one holds focus
	 * is harmless, and deferring anyway would starve that control's own resync for as
	 * long as it holds focus.
	 */
	private isTextEntryFocused(): boolean {
		const active = this.containerEl.doc.activeElement;
		if (active === null || !active.instanceOf(HTMLElement) || !this.containerEl.contains(active)) {
			return false;
		}
		if (active.instanceOf(HTMLTextAreaElement)) return true;
		if (active.instanceOf(HTMLInputElement)) {
			const textEntryTypes = ["text", "search", "url", "tel", "email", "password", "number"];
			return textEntryTypes.includes(active.type);
		}
		return active.isContentEditable;
	}

	/**
	 * Single hook for every rule-array mutation (field edit, add, delete,
	 * reorder): applies the next array and debounces its persistence.
	 */
	private commitRules(nextRules: Rule[]): void {
		this.plugin.settings.rules = nextRules;
		if (this.rulesPersistTimer !== undefined) {
			window.clearTimeout(this.rulesPersistTimer);
		}
		this.rulesPersistTimer = window.setTimeout(() => {
			this.rulesPersistTimer = undefined;
			void this.plugin.saveSettings();
		}, RULES_PERSIST_DEBOUNCE_MS);
	}

	// --- preview ---------------------------------------------------------

	private buildPreviewDefinition(): SettingDefinitionRender {
		return {
			name: "Sample path",
			desc: "Path used to preview the resulting tab title (rules run on the path with its extension stripped).",
			render: (setting, group) => {
				setting.addText((text) => {
					text.setPlaceholder(DEFAULT_SAMPLE_PATH);
					text.setValue(this.plugin.settings.samplePath ?? DEFAULT_SAMPLE_PATH);
					text.onChange((value) => {
						this.plugin.settings.samplePath = value;
						this.schedulePreviewRefresh();
						this.scheduleSamplePersist();
					});
				});

				const outputEl = group.listEl.createDiv({ cls: "ttr-preview" });
				this.previewOutputEl = outputEl;
				this.renderPreviewInto(outputEl);

				return () => {
					if (this.previewOutputEl === outputEl) {
						this.previewOutputEl = undefined;
					}
				};
			},
		};
	}

	private computePreviewSignature(): string {
		const sample = this.plugin.settings.samplePath ?? DEFAULT_SAMPLE_PATH;
		const rulesSignature = this.plugin.settings.rules
			.map(
				(rule) =>
					`${rule.id}:${rule.pattern}:${rule.replacement}:${rule.global ? 1 : 0}:${
						rule.ignoreCase ? 1 : 0
					}:${rule.enabled ? 1 : 0}`
			)
			.join("|");
		return `${sample}\u0000${rulesSignature}`;
	}

	private getPreview(): Preview {
		const signature = this.computePreviewSignature();
		if (this.previewCache === undefined || signature !== this.previewSignature) {
			const sample = this.plugin.settings.samplePath ?? DEFAULT_SAMPLE_PATH;
			this.previewCache = buildPreview(sample, this.plugin.settings.rules);
			this.previewSignature = signature;
		}
		return this.previewCache;
	}

	private schedulePreviewRefresh(): void {
		if (this.previewRenderTimer !== undefined) {
			window.clearTimeout(this.previewRenderTimer);
		}
		this.previewRenderTimer = window.setTimeout(() => {
			this.previewRenderTimer = undefined;
			if (this.previewOutputEl !== undefined) {
				this.renderPreviewInto(this.previewOutputEl);
			}
		}, PREVIEW_RENDER_DEBOUNCE_MS);
	}

	private scheduleSamplePersist(): void {
		if (this.samplePersistTimer !== undefined) {
			window.clearTimeout(this.samplePersistTimer);
		}
		this.samplePersistTimer = window.setTimeout(() => {
			this.samplePersistTimer = undefined;
			void this.plugin.savePreferences();
		}, SAMPLE_PERSIST_DEBOUNCE_MS);
	}

	private renderPreviewInto(el: HTMLElement): void {
		const preview = this.getPreview();
		el.empty();

		el.createDiv({ cls: "ttr-preview-seed", text: `Seed: ${preview.sample}` });

		const stepsEl = el.createDiv({ cls: "ttr-preview-steps" });
		for (const row of preview.rows) {
			const rule = this.plugin.settings.rules[row.index];
			const label = rule?.name || rule?.pattern || `Rule ${row.index + 1}`;
			const stepEl = stepsEl.createDiv({
				cls: `ttr-preview-step ttr-preview-step-${row.outcome}`,
			});
			stepEl.createSpan({ cls: "ttr-preview-step-label", text: `${row.index + 1}. ${label}` });
			stepEl.createSpan({ cls: "ttr-preview-step-outcome", text: row.outcome });
			if (row.outcome === "applied") {
				stepEl.createDiv({
					cls: "ttr-preview-step-transform",
					text: `${row.before} → ${row.after}`,
				});
			}
		}

		el.createDiv({ cls: "ttr-preview-result", text: `Result: ${preview.result}` });

		if (preview.usedFallback) {
			el.createDiv({
				cls: "ttr-preview-note",
				text: "No rule matched (or the result was empty); falling back to the file's basename.",
			});
		}

		if (preview.looksLikePathFragment) {
			el.createDiv({
				cls: "ttr-preview-warning",
				text: "Warning: the result still contains a path separator (/). A rule likely left a path fragment instead of a clean title.",
			});
		}
	}
}
