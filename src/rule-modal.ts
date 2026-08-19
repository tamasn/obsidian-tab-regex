import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { Rule } from "./rules";
import { ruleRowLabel, rulePatternError } from "./rule-format";

/**
 * Edits a rule's five fields as a local draft, committed once via `onSubmit`
 * on Save; Cancel/Esc discards the draft. Deliberately not live-apply: the
 * declarative control this replaces suppressed the commit on invalid input,
 * and live-applying each keystroke would either make the pattern field
 * un-clearable (validateRule rejects "", but createRule() legitimately
 * stores it) or let a >400ms pause mid-typing on a transiently invalid
 * pattern reach the debounced save and silently disable an enabled rule.
 * Save is not blocked on validity for the same reason: a work-in-progress
 * pattern must stay storable. mergeSettings on the save path is the
 * authoritative gate (architecture/constitution.md, "Every persistence entry
 * point funnels through mergeSettings").
 */
export class RuleEditModal extends Modal {
	private draft: Rule;
	private readonly onSubmit: (next: Rule) => void;

	constructor(app: App, rule: Rule, onSubmit: (next: Rule) => void) {
		super(app);
		this.draft = { ...rule };
		this.onSubmit = onSubmit;
		this.modalEl.addClass("ttr-rule-modal");
		this.setTitle(ruleRowLabel(rule));
	}

	onOpen(): void {
		const { contentEl } = this;

		new Setting(contentEl)
			.setName("Name")
			.setDesc("Optional label shown in the rule list.")
			.addText((text) => {
				text.setPlaceholder("Rule name");
				text.setValue(this.draft.name ?? "");
				text.onChange((value) => {
					this.draft = { ...this.draft, name: value === "" ? undefined : value };
				});
			});

		// patternSetting is assigned only after the `new Setting(...).addText(...)` chain
		// returns; reportPatternError is called from inside that chain's onChange (later,
		// on keystroke) and once more below (on mount), never during the chain's own
		// synchronous construction, so it never observes patternSetting before assignment.
		let patternSetting!: Setting;
		const reportPatternError = () => {
			patternSetting.setErrorMessage(rulePatternError(this.draft));
		};
		patternSetting = new Setting(contentEl)
			.setName("Pattern")
			.setDesc("Regular expression tested against the path (extension stripped).")
			.addText((text) => {
				text.setPlaceholder("e.g. ^Projects/(.+)$");
				text.setValue(this.draft.pattern);
				text.onChange((value) => {
					this.draft = { ...this.draft, pattern: value };
					reportPatternError();
				});
			});
		reportPatternError();

		new Setting(contentEl)
			.setName("Replacement")
			.setDesc("Replacement text; may reference capture groups ($1, $2, ...).")
			.addText((text) => {
				text.setValue(this.draft.replacement);
				text.onChange((value) => {
					this.draft = { ...this.draft, replacement: value };
				});
			});

		new Setting(contentEl)
			.setName("Global (g)")
			.setDesc("Replace every match instead of only the first.")
			.addToggle((toggle) => {
				// setValue before onChange: ToggleComponent.setValue fires its onChange
				// callback, so seeding an already-true flag after wiring onChange would
				// fire a spurious change on open.
				toggle.setValue(this.draft.global);
				toggle.onChange((value) => {
					this.draft = { ...this.draft, global: value };
				});
			});

		new Setting(contentEl)
			.setName("Ignore case (i)")
			.setDesc("Match without regard to letter case.")
			.addToggle((toggle) => {
				toggle.setValue(this.draft.ignoreCase);
				toggle.onChange((value) => {
					this.draft = { ...this.draft, ignoreCase: value };
				});
			});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText("Save");
				button.setCta();
				button.onClick(() => {
					this.onSubmit(this.draft);
					this.close();
				});
			})
			.addButton((button) => {
				button.setButtonText("Cancel");
				button.onClick(() => this.close());
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
