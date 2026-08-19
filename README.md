# obsidian-tab-regex

An Obsidian plugin for rule based customization of tab titles.

Tab Title Rules rewrites the label Obsidian shows on a tab by running the note's vault path through
an ordered chain of regex rules that you configure. The underlying file is never renamed — the
plugin only changes what the tab, the in-pane view header, and the window title display.

## Requirements

- Obsidian **1.13.1** or newer (the settings screen uses the declarative settings API introduced in
  that version).
- To build the plugin: [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

## Installation

The plugin is not in Obsidian's community plugin browser, and it has no published GitHub release
yet, so BRAT cannot install it either. The only way to install it today is to build it from source
and copy the build output into your vault. That is the procedure below.

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

An installed Obsidian plugin is a folder under `<your-vault>/.obsidian/plugins/`, named after the
plugin's `id`. This plugin's `id` is `tab-title-rules`, so the folder must be named
`tab-title-rules` — not `obsidian-tab-regex`.

Three files need to be in it: `main.js`, `manifest.json`, and `styles.css`.

```sh
VAULT=/path/to/your/vault
mkdir -p "$VAULT/.obsidian/plugins/tab-title-rules"
cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/tab-title-rules/"
```

`.obsidian` is a hidden folder; if you are copying the files in Finder rather than a shell, press
`Cmd+Shift+.` to reveal it.

### 3. Enable it in Obsidian

1. Open the vault in Obsidian. If it was already open, reload it — **Settings → Community plugins →
   the reload icon**, or the **Reload app without saving** command — so Obsidian picks up the new
   folder.
2. Go to **Settings → Community plugins**. If you have never enabled community plugins in this
   vault, turn off **Restricted mode** first.
3. Find **Tab Title Rules** in the **Installed plugins** list and turn it on.
4. Its settings screen appears under **Settings → Community plugins → Tab Title Rules**, where you
   can add rules and preview them against a sample path.

## Updating

Pull the latest source, rebuild, and copy the three files over the old ones:

```sh
git pull
pnpm install
pnpm run build
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

For a fast edit-reload loop, point a scratch vault's plugin folder at your clone (a symlink to the
repository directory works) so `pnpm run dev` writes straight into it.

## Notes

- The plugin never modifies your vault. It changes what a tab displays and nothing else — no file is
  renamed, moved, or rewritten.
- The plugin makes no network requests of any kind: no telemetry, no analytics, no update checks.
  This also means it will not tell you when a new version exists.
