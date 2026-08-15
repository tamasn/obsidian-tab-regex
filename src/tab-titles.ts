import { FileView, type App, type WorkspaceLeaf } from "obsidian";
import { around } from "monkey-around";
import { applyRules } from "./engine";
import type TabTitleRulesPlugin from "./main";

export function installTitlePatch(plugin: TabTitleRulesPlugin): () => void {
	return around(FileView.prototype, {
		getDisplayText(next) {
			return function (this: FileView) {
				const path = this.file?.path;
				if (path === undefined) {
					return next.call(this);
				}
				return plugin.titleCache.resolve(path, plugin.settings.rulesRevision, (p) =>
					applyRules(p, plugin.settings.rules)
				);
			};
		},
	});
}

export function sweepWorkspace(app: App): void {
	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		// updateHeader() is not in the public typings but is the standard ecosystem
		// way to force a tab-header redraw; the optional cast degrades gracefully
		// to a next-natural-redraw refresh instead of throwing if it ever disappears.
		(leaf as { updateHeader?: () => void }).updateHeader?.();

		// titleEl is likewise absent from FileView's public typings (only Modal
		// declares it), but it is the same held node reference the view sets once
		// at file-load via `titleEl.setText(this.getDisplayText())`; updateHeader()
		// never touches it, so without this the in-pane header goes stale.
		(leaf.view as { titleEl?: HTMLElement }).titleEl?.setText(leaf.view.getDisplayText());
	});
}
