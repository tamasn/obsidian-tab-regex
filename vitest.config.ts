import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Anchored at src/ so the default whole-repo walk cannot collect the copies of these
// tests inside git worktrees under .claude/worktrees/ — see gotchas/2026-08-15-manual-vitest-globs-test-files-inside-worktrees.md
export default defineConfig({
	// The "obsidian" package is types-only ("main": ""), so src/main.ts and anything importing
	// it are unresolvable under vitest without this. src/test-obsidian.ts stands in at run time.
	resolve: {
		alias: [{ find: /^obsidian$/, replacement: fileURLToPath(new URL("./src/test-obsidian.ts", import.meta.url)) }],
	},
	test: {
		include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
	},
});
