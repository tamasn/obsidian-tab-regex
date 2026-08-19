// Runtime stand-in for the types-only "obsidian" npm package (its "main" is ""), which makes
// `import ... from "obsidian"` unresolvable outside the real Obsidian app. Wired in via
// `resolve.alias` in vitest.config.ts so test-time imports of src/main.ts (and anything it pulls
// in transitively — src/settings-tab.ts, src/tab-titles.ts, src/rule-modal.ts) resolve to this
// module instead. Deliberately implements only the surface those files reach; not a general
// obsidian shim. `debounce` returns a no-op debouncer so saveSettings()'s trailing
// scheduleWorkspaceSweep() call does not attempt a real workspace sweep — this stub's remit is the
// save path, not the sweep. `Modal` guarantees only that `class RuleEditModal extends Modal` (a
// module-scope class declaration in rule-modal.ts) evaluates without throwing at import time: the
// named import in rule-modal.ts:1 needs some `Modal` export to resolve, so a missing or
// non-constructible `Modal` here would make that import unresolvable and fail every test file
// that transitively imports rule-modal.ts — not merely skip a construction path. `new Modal()`
// itself succeeds fine against this stub: it's `RuleEditModal` that does NOT
// support construction or any instance method: its constructor touches
// `this.modalEl`/`this.contentEl`, which a bare base class has no reason to provide, so
// `new RuleEditModal(...)` would throw against this stub, and there is no `open`/`close`/
// `setCloseCallback` here for it to call even if it didn't. That's fine today — no test constructs
// a `RuleEditModal` or opens the settings tab's modal, so settings-tab.ts's calls to
// `setCloseCallback` (including the one `hide()` now makes to suppress a torn-down tab's re-entrant
// update) are never reached. If a future test does exercise that path, this stub needs a real
// `setCloseCallback` no-op again — say so explicitly here rather than adding it silently.
// `Setting` is the same import-satisfaction treatment: referenced only inside rule-modal.ts method
// bodies, never at module scope, so a bare `export class Setting {}` is enough.
// Runtime values only: every other symbol those files pull from "obsidian" (Debouncer,
// WorkspaceLeaf, App, the SettingDefinition* types) is imported there as `import type`, so it is
// erased before it ever reaches this module — declaring it here would be dead on arrival.
// tsconfig.json also has no `paths` mapping for "obsidian", so tsc resolves those types from the
// real node_modules/obsidian package, never from this stub.
export class Plugin {
	app: unknown;
	constructor(app?: unknown) { this.app = app; }
	async loadData(): Promise<unknown> { return null; }
	async saveData(_data: unknown): Promise<void> {}
	addSettingTab(_t: unknown): void {}
	register(_cb: () => void): void {}
}
export function debounce(_fn: () => void, _ms?: number, _immediate?: boolean) {
	const d = () => {};
	d.cancel = () => d;
	d.run = () => undefined;
	return d;
}
export class App {}
export class PluginSettingTab { constructor(_app?: unknown, _plugin?: unknown) {} display(): void {} }
export class FileView {}
export class Modal {}
export class Setting {}
