import { hashStableValue } from "../../compiler/shared/determinism";
import type { WaterTerrainSnapshot } from "./WaterTerrainSnapshot";

/** Exact IEEE-754 content identity. No rounding, sampling or owner revision enters this key. */
export function waterTerrainContentHash(
  terrain: Omit<WaterTerrainSnapshot, "id" | "revision" | "heights"> & { readonly heights: ArrayLike<number> }
): string {
  let low = 0x811c9dc5,
    high = 0x9e3779b9;
  const buffer = new ArrayBuffer(8),
    view = new DataView(buffer);
  for (let index = 0; index < terrain.heights.length; index++) {
    const height = terrain.heights[index];
    view.setFloat64(0, height, true);
    for (let i = 0; i < 8; i++) {
      const byte = view.getUint8(i);
      low = Math.imul(low ^ byte, 0x01000193) >>> 0;
      high = Math.imul(high ^ byte, 0x5bd1e995) >>> 0;
      high ^= high >>> 15;
    }
  }
  return hashStableValue({
    encoding: "terrain-f64-v1",
    origin: terrain.origin,
    spacing: terrain.spacing,
    spacingZ: terrain.spacingZ ?? terrain.spacing,
    columns: terrain.columns,
    rows: terrain.rows,
    count: terrain.heights.length,
    ...(terrain.surface ? { surface: terrain.surface } : {}),
    low,
    high: high >>> 0,
    refinements: terrain.refinements?.map(waterTerrainContentHash)
  });
}
