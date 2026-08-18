import { defineConfig } from "vitest/config";

// Anchored at src/ so the default whole-repo walk cannot collect the copies of these
// tests inside git worktrees under .claude/worktrees/ — see gotchas/2026-08-15-work-vitest-globs-test-files-inside-worktrees.md
export default defineConfig({
	test: {
		include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
	},
});
