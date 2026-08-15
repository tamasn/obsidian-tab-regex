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

		// titleEl is likewise absent from the public typings (only Modal declares it),
		// but ItemView creates it (.view-header-title) and its load path seeds it once
		// with `titleEl.setText(this.getDisplayText())`; nothing rewrites it afterwards
		// except FileView on rename. Scoped to FileView because only
		// FileView.prototype.getDisplayText is patched — no other view's title text can
		// have changed, so re-setting it would be a no-op. Do not drop the guard.
		if (leaf.view instanceof FileView) {
			const view = leaf.view as FileView & { titleEl?: HTMLElement };
			view.titleEl?.setText(view.getDisplayText());
		}
	});

	// onLayoutChange() is not in the public typings but is what FileView.onRename
	// itself calls to pick up window titles. It is not cheap or title-scoped: it queues
	// a frame-deferred requestUpdateLayout, and the resulting updateLayout() also fires
	// requestSaveLayout(), requestResize() and a global "layout-change" broadcast — on
	// every rule-edit burst. Weigh that before adding further sweep triggers.
	(app.workspace as { onLayoutChange?: () => void }).onLayoutChange?.();
}
