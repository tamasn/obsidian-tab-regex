import { describe, expect, it, vi } from "vitest";
import { TitleCache } from "./title-cache";

describe("TitleCache — miss then hit", () => {
	it("first lookup is a miss: compute is called once and its value is returned", () => {
		const cache = new TitleCache();
		const compute = vi.fn().mockReturnValue("Computed Title");
		const result = cache.resolve("Notes/a.md", 0, compute);
		expect(result).toBe("Computed Title");
		expect(compute).toHaveBeenCalledTimes(1);
		expect(compute).toHaveBeenCalledWith("Notes/a.md");
	});

	it("second lookup of the same path at the same revision is a hit: compute is not called again", () => {
		const cache = new TitleCache();
		const compute = vi.fn().mockReturnValue("Computed Title");
		cache.resolve("Notes/a.md", 0, compute);
		const result = cache.resolve("Notes/a.md", 0, compute);
		expect(result).toBe("Computed Title");
		expect(compute).toHaveBeenCalledTimes(1);
	});
});

describe("TitleCache — distinct paths", () => {
	it("caches distinct paths independently at the same revision", () => {
		const cache = new TitleCache();
		const computeA = vi.fn().mockReturnValue("Title A");
		const computeB = vi.fn().mockReturnValue("Title B");

		const resultA = cache.resolve("Notes/a.md", 0, computeA);
		const resultB = cache.resolve("Notes/b.md", 0, computeB);

		expect(resultA).toBe("Title A");
		expect(resultB).toBe("Title B");
		expect(computeA).toHaveBeenCalledTimes(1);
		expect(computeB).toHaveBeenCalledTimes(1);

		// Re-resolving both at the same revision must remain hits.
		cache.resolve("Notes/a.md", 0, computeA);
		cache.resolve("Notes/b.md", 0, computeB);
		expect(computeA).toHaveBeenCalledTimes(1);
		expect(computeB).toHaveBeenCalledTimes(1);
	});
});

describe("TitleCache — revision bump discards wholesale", () => {
	it("a revision bump discards a previously-cached path, causing it to recompute", () => {
		const cache = new TitleCache();
		const computeV0 = vi.fn().mockReturnValue("Title V0");
		const computeV1 = vi.fn().mockReturnValue("Title V1");

		cache.resolve("Notes/a.md", 0, computeV0);
		const result = cache.resolve("Notes/a.md", 1, computeV1);

		expect(result).toBe("Title V1");
		expect(computeV1).toHaveBeenCalledTimes(1);
	});

	it("bumping the revision discards BOTH previously-cached paths (wholesale clear, not per-key)", () => {
		const cache = new TitleCache();
		const computeA0 = vi.fn().mockReturnValue("A0");
		const computeB0 = vi.fn().mockReturnValue("B0");
		const computeA1 = vi.fn().mockReturnValue("A1");
		const computeB1 = vi.fn().mockReturnValue("B1");

		cache.resolve("Notes/a.md", 5, computeA0);
		cache.resolve("Notes/b.md", 5, computeB0);

		const resultA = cache.resolve("Notes/a.md", 6, computeA1);
		const resultB = cache.resolve("Notes/b.md", 6, computeB1);

		expect(resultA).toBe("A1");
		expect(resultB).toBe("B1");
		expect(computeA1).toHaveBeenCalledTimes(1);
		expect(computeB1).toHaveBeenCalledTimes(1);
	});
});

describe("TitleCache — returning to a previous revision does not resurrect entries", () => {
	it("resolving at revision 0, then 1, then back to 0 recomputes rather than reusing the old revision-0 value", () => {
		const cache = new TitleCache();
		const computeV0First = vi.fn().mockReturnValue("V0 First");
		const computeV1 = vi.fn().mockReturnValue("V1");
		const computeV0Second = vi.fn().mockReturnValue("V0 Second");

		cache.resolve("Notes/a.md", 0, computeV0First);
		cache.resolve("Notes/a.md", 1, computeV1);
		const result = cache.resolve("Notes/a.md", 0, computeV0Second);

		expect(result).toBe("V0 Second");
		expect(computeV0Second).toHaveBeenCalledTimes(1);
	});
});

describe("TitleCache — clear()", () => {
	it("empties the cache; the next lookup at the same revision recomputes", () => {
		const cache = new TitleCache();
		const computeFirst = vi.fn().mockReturnValue("First");
		const computeSecond = vi.fn().mockReturnValue("Second");

		cache.resolve("Notes/a.md", 3, computeFirst);
		cache.clear();
		const result = cache.resolve("Notes/a.md", 3, computeSecond);

		expect(result).toBe("Second");
		expect(computeSecond).toHaveBeenCalledTimes(1);
	});
});

describe("TitleCache — falsy-but-valid cached values", () => {
	it("caches and returns the empty string as a HIT, not a miss", () => {
		const cache = new TitleCache();
		const compute = vi.fn().mockReturnValue("");

		const first = cache.resolve("Notes/a.md", 0, compute);
		expect(first).toBe("");
		expect(compute).toHaveBeenCalledTimes(1);

		const second = cache.resolve("Notes/a.md", 0, compute);
		expect(second).toBe("");
		expect(compute).toHaveBeenCalledTimes(1);
	});

	it("caches and returns a whitespace-only string as a HIT, not a miss", () => {
		const cache = new TitleCache();
		const compute = vi.fn().mockReturnValue("   ");

		const first = cache.resolve("Notes/a.md", 0, compute);
		expect(first).toBe("   ");
		expect(compute).toHaveBeenCalledTimes(1);

		const second = cache.resolve("Notes/a.md", 0, compute);
		expect(second).toBe("   ");
		expect(compute).toHaveBeenCalledTimes(1);
	});
});

describe("TitleCache — size", () => {
	it("starts at zero on a fresh cache", () => {
		const cache = new TitleCache();
		expect(cache.size).toBe(0);
	});

	it("increments as distinct paths are resolved, and does not double-count a repeated hit", () => {
		const cache = new TitleCache();
		cache.resolve("Notes/a.md", 0, () => "A");
		expect(cache.size).toBe(1);
		cache.resolve("Notes/b.md", 0, () => "B");
		expect(cache.size).toBe(2);
		cache.resolve("Notes/a.md", 0, () => "A again");
		expect(cache.size).toBe(2);
	});

	it("drops back to the number of entries resolved after a revision bump", () => {
		const cache = new TitleCache();
		cache.resolve("Notes/a.md", 0, () => "A");
		cache.resolve("Notes/b.md", 0, () => "B");
		expect(cache.size).toBe(2);

		cache.resolve("Notes/a.md", 1, () => "A1");
		expect(cache.size).toBe(1);
	});

	it("drops to zero after clear()", () => {
		const cache = new TitleCache();
		cache.resolve("Notes/a.md", 0, () => "A");
		cache.resolve("Notes/b.md", 0, () => "B");
		cache.clear();
		expect(cache.size).toBe(0);
	});
});

describe("TitleCache — initial revision does not collide with revision 0", () => {
	it("the very first resolve at revision 0 is a miss, not a spurious hit", () => {
		const cache = new TitleCache();
		const compute = vi.fn().mockReturnValue("Computed");
		const result = cache.resolve("Notes/a.md", 0, compute);
		expect(result).toBe("Computed");
		expect(compute).toHaveBeenCalledTimes(1);
	});
});
