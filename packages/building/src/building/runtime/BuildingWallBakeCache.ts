export interface BuildingWallLightmapInventory {
  /** Current preparation or live publication. Multiple buildings may use one type. */
  litBuildings: number;
  litTypes: number;
  /** Distinct maps needed by the above buildings; several building types can share one. */
  mapTypes: number;
  readyTypes: number;
  /** Allocated scene atlas textures, including maps retained for reuse. */
  atlasPages: number;
  /** Scene cache totals, including types retained for a later edit or undo. */
  cachedTypes: number;
  pendingTypes: number;
  bakesStarted: number;
  bakesCompleted: number;
  cacheHits: number;
  failedBakes: number;
}

export type WallBakeEventKind = "start" | "complete" | "hit" | "join" | "error";

/** The scene owns the textures. Replacing or deleting one instance cannot release another's map. */
export class BuildingWallBakeCache<T extends object> {
  private readonly ready = new Map<string, T>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly lifetime = new AbortController();
  private bakesStarted = 0;
  private bakesCompleted = 0;
  private cacheHits = 0;
  private failedBakes = 0;

  constructor(private readonly release: (value: T) => void) {}

  getOrCreate(
    key: string,
    bake: (signal: AbortSignal) => Promise<T>,
    notify?: (kind: WallBakeEventKind, value?: T, error?: unknown) => void
  ): Promise<T> {
    const { signal } = this.lifetime;
    const publish =
      notify &&
      ((kind: WallBakeEventKind, value?: T, error?: unknown) => {
        try {
          notify(kind, value, error);
        } catch (cause) {
          console.error("Building wall bake observer failed", cause);
        }
      });
    if (signal.aborted) return Promise.reject(signal.reason);
    const ready = this.ready.get(key);
    if (ready) {
      this.cacheHits++;
      publish?.("hit", ready);
      return Promise.resolve(ready);
    }
    const pending = this.pending.get(key);
    if (pending) {
      this.cacheHits++;
      if (!publish) return pending;
      return pending.then(
        (value) => {
          publish("join", value);
          return value;
        },
        (error) => {
          if (!signal.aborted) publish("error", undefined, error);
          throw error;
        }
      );
    }

    this.bakesStarted++;
    // Install the promise before invoking the producer; other instances join the same job.
    const job = Promise.resolve().then(async () => {
      try {
        signal.throwIfAborted();
        const value = await bake(signal);
        if (signal.aborted) {
          this.release(value);
          throw signal.reason;
        }
        this.ready.set(key, value);
        this.bakesCompleted++;
        publish?.("complete", value);
        return value;
      } catch (error) {
        if (!signal.aborted) {
          this.failedBakes++;
          publish?.("error", undefined, error);
        }
        throw error;
      } finally {
        this.pending.delete(key);
      }
    });
    this.pending.set(key, job);
    publish?.("start");
    return job;
  }

  get metrics() {
    return {
      cachedTypes: this.ready.size,
      pendingTypes: this.pending.size,
      bakesStarted: this.bakesStarted,
      bakesCompleted: this.bakesCompleted,
      cacheHits: this.cacheHits,
      failedBakes: this.failedBakes
    };
  }

  inventory(
    buildings: Iterable<{ typeKey: string; key: string; buildingId: string }>,
    atlasPages = 0
  ): BuildingWallLightmapInventory {
    const instances = new Set<string>();
    const types = new Set<string>();
    const maps = new Set<string>();
    for (const building of buildings) {
      instances.add(building.buildingId);
      types.add(building.typeKey);
      maps.add(building.key);
    }
    let readyTypes = 0;
    for (const key of maps) if (this.ready.has(key)) readyTypes++;
    return {
      litBuildings: instances.size,
      litTypes: types.size,
      mapTypes: maps.size,
      readyTypes,
      atlasPages,
      ...this.metrics
    };
  }

  dispose(): void {
    if (this.lifetime.signal.aborted) return;
    this.lifetime.abort();
    for (const value of this.ready.values()) this.release(value);
    this.ready.clear();
    this.pending.clear();
  }
}
