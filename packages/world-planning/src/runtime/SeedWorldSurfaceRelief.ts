import type { SeedWorldFields } from "./SeedWorldFields.ts";
import type { SeedWorldSurfaceMaterialIntent } from "./SeedWorldSurfaceIntent.ts";

/** CPU-only controls for the cached virtual-height coverage; material ownership is unchanged. */
export interface SeedWorldSurfaceReliefMaskTuning {
  /** Grass coverage mapped to zero, in [0, 1). Zero preserves the native coverage curve. */
  readonly maskCoverageStart: number;
  /** Gaussian standard deviation in world metres. Zero disables additional smoothing. */
  readonly maskSoftnessMetres: number;
}

/** Preserve the native coverage curve with a half-metre edge filter. */
export const DEFAULT_SURFACE_RELIEF_MASK_TUNING: SeedWorldSurfaceReliefMaskTuning = {
  maskCoverageStart: 0,
  maskSoftnessMetres: 0.5
};

/** Reject invalid coverage curves before allocating or replacing a live texture. */
export function validateSurfaceReliefMaskTuning(tuning: SeedWorldSurfaceReliefMaskTuning): void {
  if (
    !Number.isFinite(tuning.maskCoverageStart) ||
    tuning.maskCoverageStart < 0 ||
    tuning.maskCoverageStart >= 1 ||
    !Number.isFinite(tuning.maskSoftnessMetres) ||
    tuning.maskSoftnessMetres < 0
  )
    throw new RangeError("Surface mask requires a coverage start in [0, 1) and non-negative softness metres");
}

/** World-owned inputs required by the surface-relief mask. */
export type SeedWorldSurfaceReliefFields = Pick<
  SeedWorldFields,
  "sizeMetres" | "worldOrigin" | "surfaceResolution" | "waterMask"
>;

function softenCoverage(values: Float32Array, edge: number, sigma: number): Float32Array {
  if (sigma === 0) return values;
  const radius = Math.min(edge - 1, Math.ceil(3 * sigma));
  const weights = Array.from({ length: radius * 2 + 1 }, (_, index) =>
    Math.exp(-0.5 * ((index - radius) / sigma) ** 2)
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < weights.length; index++) weights[index] /= total;
  const horizontal = new Float32Array(values.length),
    output = new Float32Array(values.length);
  // Separable filtering keeps parameter edits linear in the blur radius, not its area.
  for (let z = 0; z < edge; z++)
    for (let x = 0; x < edge; x++) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset++)
        value += values[z * edge + Math.max(0, Math.min(edge - 1, x + offset))] * weights[offset + radius];
      horizontal[z * edge + x] = value;
    }
  for (let z = 0; z < edge; z++)
    for (let x = 0; x < edge; x++) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset++)
        value += horizontal[Math.max(0, Math.min(edge - 1, z + offset)) * edge + x] * weights[offset + radius];
      output[z * edge + x] = value;
    }
  return output;
}

/**
 * Caches native grass ownership with an optional coverage remap and physical smoothing.
 * @param fields Published world extent; native material ownership already contains water effects.
 * @param intent Published grass/soil/road ownership and optional independent river-bed layer.
 * @param tuning Coverage start and smoothing distance; omitted values apply the accepted half-metre edge filter.
 * @returns One R8 mask on the native alphamap lattice, with no resampling or mips.
 * @throws RangeError If dimensions, world extent or supplied weights are invalid.
 */
export function bakeSeedWorldSurfaceReliefMask(
  fields: SeedWorldSurfaceReliefFields,
  intent: SeedWorldSurfaceMaterialIntent,
  tuning: SeedWorldSurfaceReliefMaskTuning = DEFAULT_SURFACE_RELIEF_MASK_TUNING
): Uint8Array {
  validateSurfaceReliefMaskTuning(tuning);
  const edge = intent.resolution,
    count = edge ** 2;
  if (
    !Number.isFinite(fields.sizeMetres) ||
    fields.sizeMetres <= 0 ||
    !Number.isInteger(edge) ||
    edge < 2 ||
    fields.surfaceResolution !== edge ||
    intent.materialWeights.length !== count * 4 ||
    (intent.riverBedCoverage && intent.riverBedCoverage.length !== count)
  ) {
    throw new RangeError("Surface relief requires complete finite world coverage");
  }
  const grass = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    // Grass is the first cumulative channel in the independent river-bed blend.
    grass[index] = Math.round(
      (intent.materialWeights[index * 4] * (255 - (intent.riverBedCoverage?.[index] ?? 0))) / 255
    );
  }
  if (tuning.maskCoverageStart === 0 && tuning.maskSoftnessMetres === 0) return grass;
  const ramp = Float32Array.from(grass, (value) =>
    Math.max(0, Math.min(1, (value / 255 - tuning.maskCoverageStart) / (1 - tuning.maskCoverageStart)))
  );
  const softened = softenCoverage(ramp, edge, (tuning.maskSoftnessMetres * (edge - 1)) / fields.sizeMetres);
  return Uint8Array.from(softened, (value) => Math.round(Math.max(0, Math.min(1, value)) * 255));
}

/**
 * Packs native coverage and its finite differences for one filtered GPU read.
 * @param mask Native R8 coverage after remapping and smoothing; never modified.
 * @param resolution Square mask resolution.
 * @param sizeMetres Width of the covered world in metres.
 * @returns Linear RGB8 bytes: original coverage, signed X difference, signed Z difference.
 * @throws RangeError If the mask dimensions or world extent are invalid.
 */
export function packSeedWorldSurfaceReliefMask(mask: Uint8Array, resolution: number, sizeMetres: number): Uint8Array {
  if (
    !Number.isInteger(resolution) ||
    resolution < 2 ||
    mask.length !== resolution ** 2 ||
    !Number.isFinite(sizeMetres) ||
    sizeMetres <= 0
  )
    throw new RangeError("Invalid surface relief mask domain");
  // Match SurfaceRelief.glsl's world-space stencil. Encoding the difference (not
  // its slope) bounds both channels to [-1, 1] for every world size; 128 is exact zero.
  const offset = (0.36199188232421875 * (resolution - 1)) / sizeMetres;
  const sample = (x: number, z: number): number => {
    x = Math.max(0, Math.min(resolution - 1, x));
    z = Math.max(0, Math.min(resolution - 1, z));
    const x0 = Math.floor(x),
      z0 = Math.floor(z);
    const x1 = Math.min(x0 + 1, resolution - 1),
      z1 = Math.min(z0 + 1, resolution - 1);
    const a = mask[z0 * resolution + x0] * (1 - (x - x0)) + mask[z0 * resolution + x1] * (x - x0);
    const b = mask[z1 * resolution + x0] * (1 - (x - x0)) + mask[z1 * resolution + x1] * (x - x0);
    return (a * (1 - (z - z0)) + b * (z - z0)) / 255;
  };
  const pixels = new Uint8Array(mask.length * 3);
  for (let z = 0; z < resolution; z++)
    for (let x = 0; x < resolution; x++) {
      const index = (z * resolution + x) * 3;
      pixels[index] = mask[z * resolution + x];
      pixels[index + 1] = Math.round(128 + 127 * (sample(x + offset, z) - sample(x - offset, z)));
      pixels[index + 2] = Math.round(128 + 127 * (sample(x, z + offset) - sample(x, z - offset)));
    }
  return pixels;
}
