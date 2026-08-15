const NO_REVISION = Symbol("no-revision");

export class TitleCache {
	private entries = new Map<string, string>();
	private heldRevision: number | typeof NO_REVISION = NO_REVISION;

	resolve(path: string, revision: number, compute: (path: string) => string): string {
		if (revision !== this.heldRevision) {
			this.entries.clear();
			this.heldRevision = revision;
		}

		if (this.entries.has(path)) {
			return this.entries.get(path) as string;
		}

		const title = compute(path);
		this.entries.set(path, title);
		return title;
	}

	clear(): void {
		this.entries.clear();
	}

	get size(): number {
		return this.entries.size;
	}
}
