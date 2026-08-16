import { defineConfig } from "vitest/config";

// Scoped to src/ on purpose: the default include glob walks the whole repo and
// collects the copies of these same tests inside any git worktree under
// .claude/worktrees/, which silently multiplies the reported test count and
// makes `pnpm run test` (the propagation verification gate) depend on whether a
// worktree happens to exist.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
