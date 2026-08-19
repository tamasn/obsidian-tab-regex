# obsidian-tab-regex

An Obsidian plugin for rule based customization of tab titles.

Tab Title Rules rewrites the label Obsidian shows on a tab by running the note's vault path, with its
extension stripped, through an ordered chain of regex rules that you configure. If no rule matches,
or the chain's result is empty, the tab falls back to that same extension-stripped filename. The underlying file is
never renamed — the plugin only changes what the tab, the in-pane view header, and the window title
display.

## Requirements

- Obsidian **1.13.1** or newer (the version this plugin's typings are locked to in `pnpm-lock.yaml`,
  and the version its settings screen's declarative settings API is confirmed present in).
- To build the plugin: [Node.js](https://nodejs.org) (a recent LTS is fine; nothing older has been
  tested), [pnpm](https://pnpm.io), and git.

## Installation

The plugin is not in Obsidian's community plugin browser, and it has no published GitHub release
yet, so BRAT cannot install it either. The only way to install it today is to build it from source
and copy the build output into your vault. That is the procedure below.

Building the plugin requires a desktop machine (macOS, Windows, or Linux) with Node.js and pnpm; there
is no mobile build path. The plugin itself is not desktop-only, though — `manifest.json` declares
`isDesktopOnly: false` — so once it's installed on desktop, a vault whose sync method also carries
`.obsidian/plugins/` to mobile brings the plugin with it. Whole-directory sync tools (iCloud,
Dropbox, Syncthing) do this by default on Android, where Obsidian can open a vault stored in any of
them. On iOS, Obsidian can only open a vault in iCloud Drive or on-device storage, so only the
iCloud route works there — Dropbox and Syncthing have no way to host the vault on iOS. Obsidian
Sync does not carry plugins either way — it gates syncing installed community plugins behind its
own per-vault toggle, so check that setting if you're using it.

### 1. Build the plugin

```sh
git clone https://github.com/tamasn/obsidian-tab-regex.git
cd obsidian-tab-regex
pnpm install
pnpm run build
```

`pnpm run build` type-checks the source and bundles it into `main.js` in the repository root.
`main.js` is a build artifact and is deliberately not committed, so this step is required — cloning
alone does not give you a runnable plugin.

### 2. Copy it into your vault

An installed Obsidian plugin is a folder under `<your-vault>/.obsidian/plugins/` — `.obsidian`,
unless this vault overrides its config folder in Settings → About — named after the plugin's `id`.
This plugin's `id` is `tab-title-rules`, so the folder must be named `tab-title-rules` — not
`obsidian-tab-regex`.

Three files need to be in it: `main.js`, `manifest.json`, and `styles.css`.

```sh
VAULT=/path/to/your/vault
mkdir -p "$VAULT/.obsidian/plugins/tab-title-rules"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/tab-title-rules/"
```

`.obsidian` is a hidden folder. If you are copying the files with a file manager rather than a shell:
on macOS, press `Cmd+Shift+.` in Finder to reveal it; on Windows, enable "Show hidden files" in File
Explorer's View options; on Linux, most file managers reveal it via `Ctrl+H`.

### 3. Enable it in Obsidian

These steps are from the Obsidian UI and may differ by version.

1. Open the vault in Obsidian. If it was already open, run the **Reload app without saving** command
   from the command palette, so Obsidian picks up the new folder.
2. Go to **Settings → Community plugins**. If you have never enabled community plugins in this
   vault, turn off **Restricted mode** first — the rest of this tab, including the installed-plugins
   list, is unavailable while Restricted mode is on.
3. Find **Tab Title Rules** in the installed-plugins list and turn it on.
4. Its settings screen should then appear under **Settings → Community plugins → Tab Title Rules**,
   where you can add rules and preview them against a sample path.

## Updating

Pull the latest source, rebuild, and copy the three files over the old ones:

```sh
cd /path/to/obsidian-tab-regex
git pull
pnpm install
pnpm run build
VAULT=/path/to/your/vault
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/tab-title-rules/"
```

Then reload the plugin in Obsidian (toggle it off and on under **Community plugins**, or reload the
app). Your rules live in `data.json` inside the plugin folder and are not touched by the copy.

## Uninstalling

Turn the plugin off under **Settings → Community plugins**, then delete
`<your-vault>/.obsidian/plugins/tab-title-rules/`. Deleting that folder also deletes your rules.

## Development

```sh
pnpm run dev        # rebuild main.js on change
pnpm run test       # vitest
pnpm run typecheck  # tsc, no emit
```

For a fast edit-reload loop, point a scratch vault's plugin folder at your clone: a symlink named
`tab-title-rules` under `<scratch-vault>/.obsidian/plugins/`, pointing at your clone's directory,
works — the symlink's name is what Obsidian reads as the plugin folder name, so it must be
`tab-title-rules` regardless of what the clone itself is called. Then `pnpm run dev` writes straight
into it.

## Notes

- The plugin never modifies your notes or files. It changes what a tab displays and does not rename,
  move, or rewrite anything in the vault. It does write one file of its own: your rules are saved to
  `data.json` inside the plugin's folder (`<your-vault>/.obsidian/plugins/tab-title-rules/data.json`),
  which is how they survive a reload. Nothing outside that settings file is ever touched.
- The plugin makes no network requests of any kind: no telemetry, no analytics, no update checks.
  This also means it will not tell you when a new version exists.
