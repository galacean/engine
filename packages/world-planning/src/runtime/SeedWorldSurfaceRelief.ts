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
  validateSurfaceReliefMaskDomain(fields, intent, tuning);
  const edge = intent.resolution,
    count = edge ** 2;
  const grass = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    // Grass is the first cumulative channel in the independent river-bed blend.
    grass[index] = Math.round(
      (intent.materialWeights[index * 4] * (255 - (intent.riverBedCoverage?.[index] ?? 0))) / 255
    );
  }
  if (tuning.maskCoverageStart === 0 && tuning.maskSoftnessMetres === 0) return grass;
  const ramp = new Float32Array(count);
  const start = tuning.maskCoverageStart;
  const invSpan = 1 / (255 * (1 - start));
  const startScaled = start / (1 - start);
  for (let index = 0; index < count; index++) {
    const v = grass[index] * invSpan - startScaled;
    ramp[index] = v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
  const softened = softenCoverage(ramp, edge, (tuning.maskSoftnessMetres * (edge - 1)) / fields.sizeMetres);
  const result = new Uint8Array(count);
  for (let index = 0; index < count; index++) {
    const v = softened[index];
    result[index] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  }
  return result;
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
  const last = resolution - 1;
  const scale = 127 / 255;
  // Precompute 1D interpolation indices/weights along each axis (axis-aligned stencil).
  const p0 = new Int32Array(resolution);
  const p1 = new Int32Array(resolution);
  const pw = new Float64Array(resolution);
  const m0 = new Int32Array(resolution);
  const m1 = new Int32Array(resolution);
  const mw = new Float64Array(resolution);
  for (let i = 0; i < resolution; i++) {
    const xp = Math.max(0, Math.min(last, i + offset));
    const xp0 = Math.floor(xp);
    p0[i] = xp0;
    p1[i] = Math.min(xp0 + 1, last);
    pw[i] = xp - xp0;
    const xm = Math.max(0, Math.min(last, i - offset));
    const xm0 = Math.floor(xm);
    m0[i] = xm0;
    m1[i] = Math.min(xm0 + 1, last);
    mw[i] = xm - xm0;
  }
  const pixels = new Uint8Array(mask.length * 3);
  for (let z = 0; z < resolution; z++) {
    const row = z * resolution;
    const zp0Row = p0[z] * resolution;
    const zp1Row = p1[z] * resolution;
    const zpw = pw[z];
    const zm0Row = m0[z] * resolution;
    const zm1Row = m1[z] * resolution;
    const zmw = mw[z];
    for (let x = 0; x < resolution; x++) {
      const index = (row + x) * 3;
      pixels[index] = mask[row + x];
      const xpVal = mask[row + p0[x]] * (1 - pw[x]) + mask[row + p1[x]] * pw[x];
      const xmVal = mask[row + m0[x]] * (1 - mw[x]) + mask[row + m1[x]] * mw[x];
      const zpVal = mask[zp0Row + x] * (1 - zpw) + mask[zp1Row + x] * zpw;
      const zmVal = mask[zm0Row + x] * (1 - zmw) + mask[zm1Row + x] * zmw;
      pixels[index + 1] = Math.round(128 + scale * (xpVal - xmVal));
      pixels[index + 2] = Math.round(128 + scale * (zpVal - zmVal));
    }
  }
  return pixels;
}

export function validateSurfaceReliefMaskDomain(
  fields: SeedWorldSurfaceReliefFields,
  intent: SeedWorldSurfaceMaterialIntent,
  tuning: SeedWorldSurfaceReliefMaskTuning
): void {
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
}

/** Detached worker output; texture ownership stays with the publication transaction. */
export interface PreparedSurfaceReliefMask {
  readonly resolution: number;
  readonly sizeMetres: number;
  readonly tuning: SeedWorldSurfaceReliefMaskTuning;
  readonly pixels: Uint8Array;
}
export function prepareSurfaceReliefMask(
  fields: SeedWorldSurfaceReliefFields,
  intent: SeedWorldSurfaceMaterialIntent,
  tuning: SeedWorldSurfaceReliefMaskTuning
): PreparedSurfaceReliefMask {
  return {
    resolution: intent.resolution,
    sizeMetres: fields.sizeMetres,
    tuning: { ...tuning },
    pixels: packSeedWorldSurfaceReliefMask(
      bakeSeedWorldSurfaceReliefMask(fields, intent, tuning),
      intent.resolution,
      fields.sizeMetres
    )
  };
}
/** Compare the exact input bytes used by the mask, not unrelated water/soil channels. */
export function sameSurfaceReliefCoverage(
  a: SeedWorldSurfaceMaterialIntent,
  b: SeedWorldSurfaceMaterialIntent
): boolean {
  if (
    a.resolution !== b.resolution ||
    a.materialWeights.length !== b.materialWeights.length ||
    a.materialWeights.length !== a.resolution ** 2 * 4 ||
    (a.riverBedCoverage && a.riverBedCoverage.length !== a.resolution ** 2) ||
    (b.riverBedCoverage && b.riverBedCoverage.length !== b.resolution ** 2)
  )
    return false;
  for (let i = 0; i < a.resolution ** 2; i++) {
    const before = Math.round((a.materialWeights[i * 4] * (255 - (a.riverBedCoverage?.[i] ?? 0))) / 255);
    const after = Math.round((b.materialWeights[i * 4] * (255 - (b.riverBedCoverage?.[i] ?? 0))) / 255);
    if (before !== after) return false;
  }
  return true;
}
