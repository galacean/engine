import type { SeedWorldSurfaceMaterialIntent } from "../runtime/SeedWorldSurfaceIntent.ts";

const projections = new WeakMap<SeedWorldSurfaceMaterialIntent, Uint8Array>();

/** Project immutable world classification to explicit grass/mineral/bare-ground RGBA weights.
 * World consumers retain the original road/water channels. The returned projection is shared
 * by terrain publication and grass coverage for the same immutable surface revision.
 */
export function seedWorldRenderWeights(intent: SeedWorldSurfaceMaterialIntent): Uint8Array {
  const cached = projections.get(intent);
  if (cached) return cached;
  const source = intent.materialWeights,
    bed = intent.riverBedCoverage;
  const count = intent.resolution ** 2;
  if (
    source.length !== count * 4 ||
    (bed && bed.length !== count) ||
    (intent.soilCoverage && intent.soilCoverage.length !== count)
  )
    throw new RangeError("Render weights require complete published surface coverage");
  const output = new Uint8Array(source.length);
  for (let i = 0; i < count; i++) {
    const p = i * 4,
      remaining = 255 - (bed?.[i] ?? 0);
    // Match the former cumulative rounding so grass/relief boundaries stay byte-identical.
    const grass = Math.round((source[p] * remaining) / 255);
    const beforeMineral = source[p] + source[p + 1];
    const mineral =
      Math.round(((beforeMineral + source[p + 2]) * remaining) / 255) - Math.round((beforeMineral * remaining) / 255);
    output[p] = grass;
    output[p + 1] = mineral;
    const soil = Math.min(255 - grass - mineral, intent.soilCoverage?.[i] ?? 0);
    output[p + 2] = 255 - grass - mineral - soil;
    output[p + 3] = soil;
  }
  projections.set(intent, output);
  return output;
}
