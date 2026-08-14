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
		if (parsed === undefined) return undefined;
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
		if (parsed === undefined) return;
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
			case "enabled":
				nextRule = { ...rule, enabled: Boolean(value) };
				break;
			default:
				return;
		}

		const rules = [...this.plugin.settings.rules];
		rules[index] = nextRule;
		this.commitRules(rules);

		if (parsed.field === "pattern" || parsed.field === "global" || parsed.field === "ignoreCase") {
			this.refreshDomState();
		}
		this.schedulePreviewRefresh();
	}

	hide(): void {
		if (this.rulesPersistTimer !== undefined) {
			window.clearTimeout(this.rulesPersistTimer);
			this.rulesPersistTimer = undefined;
			void this.plugin.saveSettings();
		}
		if (this.samplePersistTimer !== undefined) {
			window.clearTimeout(this.samplePersistTimer);
			this.samplePersistTimer = undefined;
			void this.plugin.savePreferences();
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
		return `/${rule.pattern}/${flagsOf(rule)} → ${rule.replacement}`;
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
		return `${sample} ${rulesSignature}`;
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
