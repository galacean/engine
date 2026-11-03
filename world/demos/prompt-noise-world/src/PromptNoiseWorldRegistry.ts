import { hashPromptNoise } from "@galacean/engine-world-planning/generation/noise/PromptNoiseHash";
import {
  decodePromptNoiseWorldRecipe,
  digestPromptNoiseWorldRecipe,
  type PromptNoiseEncodedWorldV3,
  PromptNoiseTerrainProgram
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";

const DATABASE_NAME = "prompt-noise-world-v3";
const DATABASE_VERSION = 1;
const STORE_NAME = "worlds";

interface StoredPromptNoiseWorld {
  readonly worldId: number;
  readonly sha256: string;
  readonly bytes: ArrayBuffer;
}

/** One registered numeric world identity and its self-contained export. */
export interface PromptNoiseWorldRegistryEntryV1 extends PromptNoiseEncodedWorldV3 {
  /** Canonical digest computed with the embedded numeric id cleared. */
  readonly sha256: string;
  /** Whether an imported colliding id had to be reassigned. */
  readonly remapped: boolean;
}

/**
 * Maps short numeric World Seed IDs to self-contained V3 operator tables.
 * Browser persistence is best effort; the same API remains usable in deterministic tests without IndexedDB.
 */
export class PromptNoiseWorldRegistry {
  private readonly _memory = new Map<number, StoredPromptNoiseWorld>();
  private _databasePromise: Promise<IDBDatabase | null> | null = null;

  /**
   * Registers a recipe under a stable digest-derived numeric id.
   * @param program Complete terrain program.
   * @returns Registry entry with explicit bytes and digest.
   */
  async register(program: PromptNoiseTerrainProgram): Promise<PromptNoiseWorldRegistryEntryV1> {
    const digest = await digestPromptNoiseWorldRecipe(program.recipe);
    const worldId = await this._allocateId(digest.sha256, digest.worldIdCandidates);
    const encoded = program.encode(worldId);
    await this._write({ worldId, sha256: digest.sha256, bytes: exactArrayBuffer(encoded.bytes) });
    return Object.freeze({ ...encoded, sha256: digest.sha256, remapped: false });
  }

  /**
   * Imports a self-contained operator table and registers it locally.
   * @param bytes Exported `.pnw3` bytes.
   * @returns Registered entry; `remapped` reports a numeric collision.
   */
  async import(bytes: Uint8Array): Promise<PromptNoiseWorldRegistryEntryV1> {
    const decoded = decodePromptNoiseWorldRecipe(bytes);
    const digest = await digestPromptNoiseWorldRecipe(decoded.program.recipe);
    const existing = await this._read(decoded.worldId);
    const worldId = !existing || existing.sha256 === digest.sha256
      ? decoded.worldId
      : await this._allocateId(digest.sha256, digest.worldIdCandidates);
    const encoded = decoded.program.encode(worldId);
    await this._write({ worldId, sha256: digest.sha256, bytes: exactArrayBuffer(encoded.bytes) });
    return Object.freeze({ ...encoded, sha256: digest.sha256, remapped: worldId !== decoded.worldId });
  }

  /**
   * Resolves one numeric World Seed ID.
   * @param worldId Unsigned registry key.
   * @returns Stored program and digest, or `null` when absent.
   */
  async load(worldId: number): Promise<{
    readonly program: PromptNoiseTerrainProgram;
    readonly entry: PromptNoiseWorldRegistryEntryV1;
  } | null> {
    const stored = await this._read(worldId >>> 0);
    if (!stored) return null;
    const bytes = new Uint8Array(stored.bytes.slice(0));
    const decoded = decodePromptNoiseWorldRecipe(bytes);
    const encoded = decoded.program.encode(decoded.worldId);
    return Object.freeze({
      program: decoded.program,
      entry: Object.freeze({ ...encoded, sha256: stored.sha256, remapped: false })
    });
  }

  /** Removes every locally registered experiment world. */
  async clear(): Promise<void> {
    this._memory.clear();
    const database = await this._database();
    if (!database) return;
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).clear());
  }

  private async _allocateId(sha256: string, candidates: readonly number[]): Promise<number> {
    for (const candidate of candidates) {
      const worldId = candidate >>> 0 || 1;
      const existing = await this._read(worldId);
      if (!existing || existing.sha256 === sha256) return worldId;
    }
    let attempt = 1;
    while (attempt < 0xffff_ffff) {
      const worldId = hashPromptNoise(Number.parseInt(sha256.slice(0, 8), 16), attempt) || attempt;
      const existing = await this._read(worldId);
      if (!existing || existing.sha256 === sha256) return worldId >>> 0;
      attempt++;
    }
    throw new Error("Prompt-noise registry exhausted uint32 World Seed IDs");
  }

  private async _read(worldId: number): Promise<StoredPromptNoiseWorld | null> {
    const memory = this._memory.get(worldId);
    if (memory) return cloneStored(memory);
    const database = await this._database();
    if (!database) return null;
    const stored = await requestResult<StoredPromptNoiseWorld | undefined>(
      database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(worldId)
    );
    if (!stored) return null;
    this._memory.set(worldId, cloneStored(stored));
    return cloneStored(stored);
  }

  private async _write(stored: StoredPromptNoiseWorld): Promise<void> {
    this._memory.set(stored.worldId, cloneStored(stored));
    const database = await this._database();
    if (!database) return;
    await requestResult(database.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(stored));
  }

  private _database(): Promise<IDBDatabase | null> {
    if (this._databasePromise) return this._databasePromise;
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    this._databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "worldId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Prompt-noise registry failed to open"));
    }).catch((error) => {
      console.warn("[prompt-noise-world] IndexedDB unavailable; registry remains in memory", error);
      return null;
    });
    return this._databasePromise;
  }
}

function requestResult<T = undefined>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Prompt-noise registry request failed"));
  });
}

function cloneStored(stored: StoredPromptNoiseWorld): StoredPromptNoiseWorld {
  return { worldId: stored.worldId, sha256: stored.sha256, bytes: stored.bytes.slice(0) };
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
