import {
  parseSeedWorldCameraBookmark,
  writeSeedWorldCameraBookmark,
  type SeedWorldCameraBookmark
} from "./SeedWorldCameraBookmark";
import { SeedWorldSaveScheduler } from "./SeedWorldSaveScheduler";

export const SEED_WORLD_PLAYER_DEBOUNCE_MS = 4_000;
export const SEED_WORLD_PLAYER_MAX_WAIT_MS = 12_000;

export function seedWorldPlayerStateKey(worldId: string): string {
  return `seed-world:player-state:v1:${encodeURIComponent(worldId)}`;
}

/** Private view state; never included in the shareable world snapshot. */
export class SeedWorldPlayerState {
  private _latest = "";
  private readonly _key: string;
  private readonly _scheduler: SeedWorldSaveScheduler<string>;

  constructor(
    worldId: string,
    private readonly _storage: () => Pick<Storage, "getItem" | "setItem">,
    private readonly _onError: (error: unknown) => void = console.warn
  ) {
    this._key = seedWorldPlayerStateKey(worldId);
    this._scheduler = new SeedWorldSaveScheduler({
      capture: () => this._latest,
      save: async (camera) => {
        this._storage().setItem(this._key, JSON.stringify({ schemaVersion: 1, camera }));
      },
      onStatus: () => {},
      onError: _onError,
      debounceMs: SEED_WORLD_PLAYER_DEBOUNCE_MS,
      maxWaitMs: SEED_WORLD_PLAYER_MAX_WAIT_MS
    });
  }

  load(): SeedWorldCameraBookmark | undefined {
    try {
      const raw = this._storage().getItem(this._key);
      if (raw === null) return undefined;
      const value = JSON.parse(raw);
      if (value?.schemaVersion !== 1 || typeof value.camera !== "string") throw new Error("Invalid player state");
      const bookmark = parseSeedWorldCameraBookmark(new URLSearchParams(value.camera));
      if (!bookmark) throw new Error("Missing player camera");
      return bookmark;
    } catch (error) {
      this._onError(error);
      return undefined;
    }
  }

  /** Millimetre/0.001-degree precision ignores floating-point settling noise. */
  observe(bookmark: SeedWorldCameraBookmark): void {
    const camera = writeSeedWorldCameraBookmark(new URLSearchParams(), bookmark).toString();
    if (camera === this._latest) return;
    this._latest = camera;
    this._scheduler.markDirty();
  }

  flush(): Promise<void> {
    return this._scheduler.flush();
  }
  dispose(): void {
    this._scheduler.dispose();
  }
}
