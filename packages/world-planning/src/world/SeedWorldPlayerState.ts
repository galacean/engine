import {
  normalizeSeedWorldCameraYawDegrees,
  parseSeedWorldCameraBookmark,
  quantizeSeedWorldCameraNumber,
  writeSeedWorldCameraBookmark,
  type SeedWorldCameraBookmark
} from "./SeedWorldCameraBookmark";
import { SeedWorldSaveScheduler } from "./SeedWorldSaveScheduler";

export const SEED_WORLD_PLAYER_DEBOUNCE_MS = 4_000;
export const SEED_WORLD_PLAYER_MAX_WAIT_MS = 12_000;

export function seedWorldPlayerStateKey(worldId: string): string {
  return `seed-world:player-state:v1:${encodeURIComponent(worldId)}`;
}

function sameQuantizedNumber(a: number, b: number): boolean {
  return a === b || (a !== a && b !== b);
}

function sameQuantizedOptionalNumber(a: number | undefined, b: number | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a !== a && b !== b);
}

/** Private view state; never included in the shareable world snapshot. */
export class SeedWorldPlayerState {
  private _latest = "";
  private _latestDirty = false;
  private _hasObserved = false;
  private _rawX = 0;
  private _rawY = 0;
  private _rawZ = 0;
  private _rawYaw = 0;
  private _rawPitch = 0;
  private _rawMode: SeedWorldCameraBookmark["mode"] = "roam";
  private _rawOrbitDistance: number | undefined = undefined;
  private _qX = 0;
  private _qY = 0;
  private _qZ = 0;
  private _qYaw = 0;
  private _qPitch = 0;
  private _qMode: SeedWorldCameraBookmark["mode"] = "roam";
  private _qOrbitDistance: number | undefined = undefined;
  private readonly _pendingPosition: [number, number, number] = [0, 0, 0];
  private readonly _pendingBookmark: {
    position: [number, number, number];
    yawDegrees: number;
    pitchDegrees: number;
    mode: SeedWorldCameraBookmark["mode"];
    orbitDistanceMetres?: number;
  } = {
    position: this._pendingPosition,
    yawDegrees: 0,
    pitchDegrees: 0,
    mode: "roam",
    orbitDistanceMetres: undefined
  };
  private readonly _key: string;
  private readonly _scheduler: SeedWorldSaveScheduler<string>;

  constructor(
    worldId: string,
    private readonly _storage: () => Pick<Storage, "getItem" | "setItem">,
    private readonly _onError: (error: unknown) => void = console.warn
  ) {
    this._key = seedWorldPlayerStateKey(worldId);
    this._scheduler = new SeedWorldSaveScheduler({
      capture: () => this._captureCameraQuery(),
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
    const x = bookmark.position[0];
    const y = bookmark.position[1];
    const z = bookmark.position[2];
    const yaw = bookmark.yawDegrees;
    const pitch = bookmark.pitchDegrees;
    const mode = bookmark.mode;
    const orbitDistance =
      mode === "orbit" && bookmark.orbitDistanceMetres !== undefined ? bookmark.orbitDistanceMetres : undefined;

    if (
      this._hasObserved &&
      x === this._rawX &&
      y === this._rawY &&
      z === this._rawZ &&
      yaw === this._rawYaw &&
      pitch === this._rawPitch &&
      mode === this._rawMode &&
      orbitDistance === this._rawOrbitDistance
    ) {
      return;
    }

    const qX = quantizeSeedWorldCameraNumber(x);
    const qY = quantizeSeedWorldCameraNumber(y);
    const qZ = quantizeSeedWorldCameraNumber(z);
    const qYaw = quantizeSeedWorldCameraNumber(normalizeSeedWorldCameraYawDegrees(yaw));
    const qPitch = quantizeSeedWorldCameraNumber(pitch);
    const qOrbitDistance = orbitDistance !== undefined ? quantizeSeedWorldCameraNumber(orbitDistance) : undefined;

    if (
      this._hasObserved &&
      sameQuantizedNumber(qX, this._qX) &&
      sameQuantizedNumber(qY, this._qY) &&
      sameQuantizedNumber(qZ, this._qZ) &&
      sameQuantizedNumber(qYaw, this._qYaw) &&
      sameQuantizedNumber(qPitch, this._qPitch) &&
      mode === this._qMode &&
      sameQuantizedOptionalNumber(qOrbitDistance, this._qOrbitDistance)
    ) {
      this._setRawObserved(x, y, z, yaw, pitch, mode, orbitDistance);
      return;
    }

    this._hasObserved = true;
    this._setRawObserved(x, y, z, yaw, pitch, mode, orbitDistance);
    this._qX = qX;
    this._qY = qY;
    this._qZ = qZ;
    this._qYaw = qYaw;
    this._qPitch = qPitch;
    this._qMode = mode;
    this._qOrbitDistance = qOrbitDistance;

    // Copy scalar values immediately so frame-loop callers can reuse `bookmark` in place.
    this._pendingPosition[0] = x;
    this._pendingPosition[1] = y;
    this._pendingPosition[2] = z;
    this._pendingBookmark.yawDegrees = yaw;
    this._pendingBookmark.pitchDegrees = pitch;
    this._pendingBookmark.mode = mode;
    this._pendingBookmark.orbitDistanceMetres = orbitDistance;
    this._latestDirty = true;

    this._scheduler.markDirty();
  }

  private _setRawObserved(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
    mode: SeedWorldCameraBookmark["mode"],
    orbitDistance: number | undefined
  ): void {
    this._rawX = x;
    this._rawY = y;
    this._rawZ = z;
    this._rawYaw = yaw;
    this._rawPitch = pitch;
    this._rawMode = mode;
    this._rawOrbitDistance = orbitDistance;
  }

  private _captureCameraQuery(): string {
    if (this._latestDirty) {
      this._latest = writeSeedWorldCameraBookmark(new URLSearchParams(), this._pendingBookmark).toString();
      this._latestDirty = false;
    }
    return this._latest;
  }

  flush(): Promise<void> {
    return this._scheduler.flush();
  }
  dispose(): void {
    this._scheduler.dispose();
  }
}
