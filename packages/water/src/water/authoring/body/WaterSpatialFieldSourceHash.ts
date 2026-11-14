import type { TerrainBedSamplesWaterBathymetrySourceV1 } from "./WaterBodyAuthoringTypes";

function toHex(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashCanonicalString(value: string): string {
  let low = 0x811c9dc5;
  let high = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    const lowByte = code & 0xff;
    const highByte = code >>> 8;
    low = Math.imul(low ^ lowByte, 0x01000193) >>> 0;
    low = Math.imul(low ^ highByte, 0x01000193) >>> 0;
    high = Math.imul(high ^ lowByte, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
    high = Math.imul(high ^ highByte, 0x5bd1e995) >>> 0;
    high ^= high >>> 15;
  }
  return `${toHex(high)}${toHex(low)}`;
}

/**
 * Stable identity for detached Terrain samples. The canonical payload omits
 * policy-only maximumDepth and preserves the declared row-major sample order.
 */
export function computeTerrainBedSamplesContentHash(
  source: Pick<
    TerrainBedSamplesWaterBathymetrySourceV1,
    "schemaVersion" | "kind" | "sampleOrder" | "resolution" | "bedHeights"
  >
): string {
  return hashCanonicalString(
    JSON.stringify({
      schemaVersion: source.schemaVersion,
      kind: source.kind,
      sampleOrder: source.sampleOrder,
      resolution: [source.resolution[0], source.resolution[1]],
      bedHeights: Array.from(source.bedHeights)
    })
  );
}
