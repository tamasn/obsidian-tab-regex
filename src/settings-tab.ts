import { App, PluginSettingTab } from "obsidian";
import type {
	SettingDefinitionItem,
	SettingDefinitionList,
	SettingDefinitionRender,
} from "obsidian";
import { DEFAULT_SAMPLE_PATH, validateRule, type Rule } from "./rules";
import { createRule, moveItem } from "./rule-ops";
import { formatRuleSummary, ruleRowLabel } from "./rule-format";
import { RuleEditModal } from "./rule-modal";
import { buildPreview, type Preview } from "./preview";
import type TabTitleRulesPlugin from "./main";

const RULES_PERSIST_DEBOUNCE_MS = 400;
const SAMPLE_PERSIST_DEBOUNCE_MS = 400;
const PREVIEW_RENDER_DEBOUNCE_MS = 200;
const UPDATE_RETRY_MS = 400;

export class TabTitleRulesSettingTab extends PluginSettingTab {
	plugin: TabTitleRulesPlugin;

	private rulesPersistTimer: number | undefined;
	private samplePersistTimer: number | undefined;
	private previewRenderTimer: number | undefined;
	private updateRetryTimer: number | undefined;
	private previewOutputEl: HTMLElement | undefined;
	private previewSignature: string | undefined;
	private previewCache: Preview | undefined;
	private activeRuleModal: RuleEditModal | undefined;

	constructor(app: App, plugin: TabTitleRulesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [this.buildRulesListDefinition(), this.buildPreviewDefinition()];
	}

	hide(): void {
		// Close any open rule modal before the timer clears below, so its close
		// callback's requestUpdate() either runs synchronously or leaves a timer
		// the subsequent clear collects.
		const modal = this.activeRuleModal;
		this.activeRuleModal = undefined;
		modal?.close();

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
		if (this.updateRetryTimer !== undefined) {
			window.clearTimeout(this.updateRetryTimer);
			this.updateRetryTimer = undefined;
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
			items: this.plugin.settings.rules.map((rule) => this.buildRuleRowDefinition(rule)),
			emptyState: "No rules defined yet. Use the + button to add one.",
			onReorder: (oldIndex, newIndex) => {
				// moveItem uses the after-removal convention for `newIndex`, confirmed
				// against Obsidian's own array move (decompiled): Kd(e,t,n){i=e[t];
				// e.splice(t,1); e.splice(n,0,i)} — identical logic — whose internal
				// consumers pass onReorder's raw arguments straight in.
				this.commitRules(moveItem(this.plugin.settings.rules, oldIndex, newIndex));
				this.schedulePreviewRefresh();
				this.requestUpdate();
			},
			onDelete: (index) => {
				const rules = [...this.plugin.settings.rules];
				rules.splice(index, 1);
				this.commitRules(rules);
				this.schedulePreviewRefresh();
				this.requestUpdate();
			},
			addItem: {
				name: "Add rule",
				action: () => {
					this.commitRules([...this.plugin.settings.rules, createRule()]);
					this.schedulePreviewRefresh();
					this.requestUpdate();
				},
			},
		};
	}

	/**
	 * Keyed by `rule.id` (not the display name or position): the framework
	 * keys a non-`control` list item by name when present, which collides
	 * whenever two rules are unnamed (the default after pressing + twice) and
	 * logs a duplicate-key warning on every render; a positional key loses
	 * identity across a reorder or delete, misdirecting focus to the wrong
	 * row. An id key lets the reconciler move the existing DOM node to follow
	 * the rule instead. `searchable: false` keeps the id out of the settings
	 * search index, matching Obsidian's own reorderable lists.
	 */
	private buildRuleRowDefinition(rule: Rule): SettingDefinitionRender {
		return {
			name: rule.id,
			desc: formatRuleSummary(rule),
			searchable: false,
			render: (setting) => {
				// Re-resolve by the captured id, never the captured `rule` object:
				// savePreferences() deliberately leaves this.settings unsanitised, so
				// validity must be read live off the current array.
				const current = this.findRule(rule.id);
				if (current === undefined) return;

				// Mandatory: the framework has already called setName(rule.id) (the
				// definition's `name` doubles as its key), so the row must be told its
				// human-readable label explicitly.
				setting.setName(ruleRowLabel(current));
				setting.setClass("ttr-rule-row");

				const valid = this.isRuleValid(current.id);

				setting.addDisplayValue((c) =>
					c.setValue(valid ? null : "Invalid pattern").setStatus(valid ? null : "warning")
				);

				setting.addToggle((toggle) => {
					// setValue before onChange, per rule-modal.ts's toggle warning:
					// ToggleComponent.setValue fires onChange.
					toggle.setValue(current.enabled);
					toggle.setDisabled(!valid);
					toggle.onChange((next) => this.setRuleEnabled(rule.id, next));
				});

				setting.addExtraButton((button) => {
					button.setIcon("lucide-pencil");
					button.setTooltip("Edit rule");
					button.onClick(() => this.openRuleEditor(rule.id));
				});

				// No cleanup returned: everything created above lives inside `setting`,
				// which the reconciler clear()s before re-render and drops on removal.
				// A cleanup would only be needed for a node created outside the row
				// (as buildPreviewDefinition() does with group.listEl.createDiv) or a
				// tab-level registration.
			},
		};
	}

	private openRuleEditor(id: string): void {
		const rule = this.findRule(id);
		if (rule === undefined) return;
		const modal = new RuleEditModal(this.app, rule, (next) => {
			const rules = [...this.plugin.settings.rules];
			const index = rules.findIndex((r) => r.id === id);
			if (index === -1) return;
			rules[index] = next;
			this.commitRules(rules);
			this.schedulePreviewRefresh();
		});
		modal.setCloseCallback(() => {
			this.activeRuleModal = undefined;
			this.requestUpdate();
		});
		this.activeRuleModal = modal;
		modal.open();
	}

	/**
	 * Re-resolves the rule and rejects the enable without mutating if it is
	 * invalid — the toggle's `disabled` state is frozen at render time, and
	 * the underlying rule can move between render and click (a debounced
	 * saveSettings re-merge adopting a sanitised rule, or a modal commit
	 * landing). mergeSettings remains the authoritative gate; this is a
	 * best-effort resync. The reject path calls requestUpdate() rather than
	 * toggle.setValue(false), which would re-enter onChange.
	 */
	private setRuleEnabled(id: string, next: boolean): void {
		const rule = this.findRule(id);
		if (rule === undefined) return;
		if (next && !this.isRuleValid(id)) {
			this.requestUpdate();
			return;
		}
		const rules = [...this.plugin.settings.rules];
		const index = rules.findIndex((r) => r.id === id);
		if (index === -1) return;
		rules[index] = { ...rule, enabled: next };
		this.commitRules(rules);
		this.schedulePreviewRefresh();
		this.requestUpdate();
	}

	private findRule(id: string): Rule | undefined {
		return this.plugin.settings.rules.find((rule) => rule.id === id);
	}

	private isRuleValid(id: string): boolean {
		const rule = this.findRule(id);
		return rule !== undefined && validateRule(rule).ok;
	}

	/**
	 * Runs update() synchronously unless a text-entry control inside this
	 * tab currently has focus, in which case it retries on a short timer
	 * instead of updating immediately — re-checking focus each time — so the
	 * pending update is deferred, never dropped. With the per-rule fields
	 * moved into a modal there is nothing left to coalesce (the 400ms
	 * debounce this replaces existed to coalesce per-keystroke refreshes of
	 * a page row's displayValue/status/name); the only thing left to defer
	 * against is the sample-path text field.
	 */
	private requestUpdate(): void {
		if (this.isTextEntryFocused()) {
			if (this.updateRetryTimer !== undefined) {
				window.clearTimeout(this.updateRetryTimer);
			}
			this.updateRetryTimer = window.setTimeout(() => {
				this.updateRetryTimer = undefined;
				this.requestUpdate();
			}, UPDATE_RETRY_MS);
			return;
		}
		this.update();
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
