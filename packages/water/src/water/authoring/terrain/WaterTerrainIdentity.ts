import { hashStableValue } from "../../compiler/shared/determinism";
import { isImmutableWaterSnapshot } from "../identity/WaterImmutableSnapshot";
import { isValidatedImmutableWaterTerrainSnapshot, type WaterTerrainSnapshot } from "./WaterTerrainSnapshot";

const terrainContentHashCache = new WeakMap<object, string>();
const f64ScratchBuffer = new ArrayBuffer(8);
const f64ScratchView = new DataView(f64ScratchBuffer);
const f64ScratchBytes = new Uint8Array(f64ScratchBuffer);

export function rememberWaterTerrainContentHash(terrain: object, contentHash: string): void {
  terrainContentHashCache.set(terrain, contentHash);
}

/** Exact IEEE-754 content identity. No rounding, sampling or owner revision enters this key. */
export function waterTerrainContentHash(
  terrain: Omit<WaterTerrainSnapshot, "id" | "revision" | "heights"> & { readonly heights: ArrayLike<number> }
): string {
  const immutable = isValidatedImmutableWaterTerrainSnapshot(terrain) || isImmutableWaterSnapshot(terrain);
  if (immutable) {
    const cached = terrainContentHashCache.get(terrain);
    if (cached !== undefined) return cached;
  }
  let low = 0x811c9dc5,
    high = 0x9e3779b9;
  const heights = terrain.heights;
  const len = heights.length;
  const view = f64ScratchView;
  const bytes = f64ScratchBytes;
  for (let index = 0; index < len; index++) {
    view.setFloat64(0, heights[index], true);
    let b = bytes[0];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[1];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[2];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[3];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[4];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[5];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[6];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    b = bytes[7];
    low = Math.imul(low ^ b, 0x01000193) >>> 0;
    high = Math.imul(high ^ b, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
  }
  const hash = hashStableValue({
    encoding: "terrain-f64-v1",
    origin: terrain.origin,
    spacing: terrain.spacing,
    spacingZ: terrain.spacingZ ?? terrain.spacing,
    columns: terrain.columns,
    rows: terrain.rows,
    count: len,
    ...(terrain.surface ? { surface: terrain.surface } : {}),
    low,
    high: high >>> 0,
    refinements: terrain.refinements?.map(waterTerrainContentHash)
  });
  if (immutable) terrainContentHashCache.set(terrain, hash);
  return hash;
}

/** Compact exact identity projection of a terrain snapshot for descriptor/cache hashing. */
export function waterTerrainHashSummary(terrain: WaterTerrainSnapshot | undefined) {
  if (!terrain) return undefined;
  return {
    id: terrain.id,
    revision: terrain.revision,
    contentHash: waterTerrainContentHash(terrain)
  };
}
