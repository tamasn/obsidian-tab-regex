// Runtime stand-in for the types-only "obsidian" npm package (its "main" is ""), which makes
// `import ... from "obsidian"` unresolvable outside the real Obsidian app. Wired in via
// `resolve.alias` in vitest.config.ts so test-time imports of src/main.ts (and anything it pulls
// in transitively — src/settings-tab.ts, src/tab-titles.ts) resolve to this module instead.
// Deliberately implements only the surface those three files reach; not a general obsidian shim.
// `debounce` returns a no-op debouncer so saveSettings()'s trailing scheduleWorkspaceSweep() call
// does not attempt a real workspace sweep — this stub's remit is the save path, not the sweep.
// Runtime values only: every other symbol those three files pull from "obsidian" (Debouncer,
// WorkspaceLeaf, the SettingDefinition* types) is imported there as `import type`, so it is erased
// before it ever reaches this module — declaring it here would be dead on arrival. tsconfig.json
// also has no `paths` mapping for "obsidian", so tsc resolves those types from the real
// node_modules/obsidian package, never from this stub.
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
