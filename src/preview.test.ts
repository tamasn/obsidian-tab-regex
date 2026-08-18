import { describe, expect, it } from "vitest";
import { buildPreview } from "./preview";
import { applyRules, basenameOf } from "./engine";
import { makeRule } from "./test-fixtures";

describe("buildPreview — invalid rules", () => {
	it("reports a non-compiling rule as invalid without transforming the sample, staying index-aligned with the input rules", () => {
		const before = makeRule({ pattern: "note", replacement: "draft" });
		const invalid = makeRule({ pattern: "([unclosed", replacement: "X" });
		const after = makeRule({ pattern: "draft", replacement: "final" });
		const preview = buildPreview("note.md", [before, invalid, after]);

		expect(preview.rows).toHaveLength(3);
		expect(preview.rows[0].outcome).toBe("applied");
		expect(preview.rows[1].outcome).toBe("invalid");
		expect(preview.rows[1].before).toBe(preview.rows[1].after);
		expect(preview.rows[2].outcome).toBe("applied");
		expect(preview.result).toBe("final");
	});

	// gotcha: architecture/gotchas/2026-08-12-OTR-0002-coerced-placeholder-empty-pattern-matches-everything.md
	it("reports an empty pattern as invalid, matching validateRule's rejection", () => {
		const emptyPattern = makeRule({ pattern: "" });
		const preview = buildPreview("note.md", [emptyPattern]);
		expect(preview.rows[0].outcome).toBe("invalid");
	});

	it("does not throw and falls back to the basename when every rule is invalid (runChain must never see a non-compiling rule)", () => {
		const invalid1 = makeRule({ pattern: "([unclosed" });
		const invalid2 = makeRule({ pattern: "" });
		expect(() =>
			buildPreview("Projects/Client/index.md", [invalid1, invalid2])
		).not.toThrow();

		const preview = buildPreview("Projects/Client/index.md", [invalid1, invalid2]);
		expect(preview.rows).toHaveLength(2);
		expect(
			preview.rows.every((row: { outcome: string }) => row.outcome === "invalid")
		).toBe(true);
		expect(preview.result).toBe(basenameOf("Projects/Client/index.md"));
		expect(preview.usedFallback).toBe(true);
	});
});

describe("buildPreview — agreement with applyRules", () => {
	it("matches applyRules when every rule is valid and chains", () => {
		const rule1 = makeRule({ pattern: "note", replacement: "draft" });
		const rule2 = makeRule({ pattern: "draft", replacement: "final" });
		const preview = buildPreview("note.md", [rule1, rule2]);
		expect(preview.result).toBe("final");
		// buildPreview drives runChain directly and applyRules delegates to the same
		// call, so comparing the two against each other is a tautology; assert each
		// against the literal expected value instead.
		expect(applyRules("note.md", [rule1, rule2])).toBe("final");
	});

	it("matches applyRules on the basename-fallback path", () => {
		const rule = makeRule({ pattern: "zzz-does-not-match", replacement: "X" });
		const preview = buildPreview("Projects/Client/index.md", [rule]);
		expect(preview.result).toBe(basenameOf("Projects/Client/index.md"));
		expect(applyRules("Projects/Client/index.md", [rule])).toBe(
			basenameOf("Projects/Client/index.md")
		);
	});
});

describe("buildPreview — looksLikePathFragment", () => {
	// mirrors the unanchored-vs-anchored regression pair in engine.test.ts
	// ("applyRules — regression: unanchored vs anchored path rule") so the two stay comparable.
	it("is true when an unanchored rule leaves a path separator in the result", () => {
		const rule = makeRule({
			pattern: "([^/]+)/index$",
			replacement: "$1",
		});
		const preview = buildPreview("Projects/Client/index.md", [rule]);
		expect(preview.result).toBe("Projects/Client");
		expect(preview.looksLikePathFragment).toBe(true);
	});

	it("is false when the fully-anchored rule strips the whole path down to the segment", () => {
		const rule = makeRule({
			pattern: "^.*?([^/]+)/index$",
			replacement: "$1",
		});
		const preview = buildPreview("Projects/Client/index.md", [rule]);
		expect(preview.result).toBe("Client");
		expect(preview.looksLikePathFragment).toBe(false);
	});
});

describe("buildPreview — usedFallback", () => {
	it("surfaces true when the result came from the basename fallback, not a rule", () => {
		const rule = makeRule({ pattern: "zzz-does-not-match", replacement: "X" });
		const preview = buildPreview("Projects/Client/index.md", [rule]);
		expect(preview.usedFallback).toBe(true);
		expect(preview.result).toBe(basenameOf("Projects/Client/index.md"));
	});

	it("surfaces false when an enabled rule produced the result", () => {
		const rule = makeRule({ pattern: "note", replacement: "draft" });
		const preview = buildPreview("note.md", [rule]);
		expect(preview.usedFallback).toBe(false);
		expect(preview.result).toBe("draft");
	});
});

describe("buildPreview — long sample path capping", () => {
	// anchor: architecture/gotchas/2026-08-11-grill-catastrophic-backtracking-freezes-ui-on-hot-path.md
	// This asserts the length cap only. It does not assert (and the cap does not provide)
	// any bound on backtracking cost, which remains unmitigated on this path.
	it("caps a sample path to 256 chars before it is seeded", () => {
		const longPath = "a".repeat(300) + "/note.md";
		const capped = longPath.slice(0, 256);
		const preview = buildPreview(longPath, []);

		expect(preview.sample.length).toBeLessThanOrEqual(256);
		expect(preview.sample).toBe(capped);
		expect(preview.result).toBe(basenameOf(capped));
	});

	it("leaves a sample path at or under the cap unchanged", () => {
		const shortPath = "Projects/Client/index.md";
		const preview = buildPreview(shortPath, []);
		expect(preview.sample).toBe(shortPath);
	});
});
