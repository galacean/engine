/** Explicit immutable revisions allow repeated Terrain batches to borrow one GPU texture array.
 * Unversioned/mutable textures always receive a private copy; identity alone is insufficient.
 */
export class TerrainTextureArrayPool<TSource extends object, TResource> {
  private ids = new WeakMap<TSource, number>();
  private sequence = 0;
  private entries = new Map<string, { resource: TResource; owners: number }>();
  acquire(
    kind: string,
    sources: readonly (TSource | undefined)[],
    revisions: readonly (string | undefined)[] | undefined,
    create: () => TResource,
    destroy: (resource: TResource) => void
  ): { resource: TResource; release(): void } {
    const shared = sources.every((source, i) => !source || !!revisions?.[i]);
    const key = shared
      ? JSON.stringify([
          kind,
          sources.map((source, i) => {
            if (!source) return null;
            let id = this.ids.get(source);
            if (id === undefined) this.ids.set(source, (id = ++this.sequence));
            return [id, revisions![i]];
          })
        ])
      : undefined;
    let entry = key === undefined ? undefined : this.entries.get(key);
    if (!entry) {
      entry = { resource: create(), owners: 0 };
      if (key !== undefined) this.entries.set(key, entry);
    }
    entry.owners++;
    const borrowed = entry;
    let active = true;
    return {
      resource: entry.resource,
      release: () => {
        if (!active) return;
        active = false;
        if (--borrowed.owners === 0) {
          if (key !== undefined) this.entries.delete(key);
          destroy(borrowed.resource);
        }
      }
    };
  }
}
