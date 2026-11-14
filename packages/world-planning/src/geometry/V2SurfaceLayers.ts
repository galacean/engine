import type { V2Alphamap } from "../spatial/V2Model.ts";

/** Physical RGBA channel order shared by terrain data and both preview renderers. */
export const V2_SURFACE_CHANNELS = ["soil", "grass", "road", "sand"] as const;

/** Preview palette in RGB byte space; layer weights remain independent of these display colors. */
export const V2_SURFACE_LAYERS = [
  { id: "soil", label: "泥土", color: [146, 114, 88] },
  { id: "grass", label: "草地", color: [114, 147, 77] },
  { id: "road", label: "道路", color: [181, 161, 139] },
  { id: "sand", label: "沙地", color: [217, 197, 140] }
] as const;

/** Normalized soil, grass, road and sand weights, in physical RGBA order. */
export type V2SurfaceWeights = [number, number, number, number];

/** RGB byte-space color; interpolation may produce fractional components. */
export type V2SurfaceColor = [number, number, number];

/**
 * Bilinearly sample cell-centred RGBA weights with clamped terrain edges.
 * @param alphamap Published four-channel byte data.
 * @param size Width and depth of the square world, in metres.
 * @param x World X coordinate, with zero at the world centre.
 * @param z World Z coordinate, increasing with alphamap row index.
 * @param out Optional reusable normalized weight tuple.
 * @returns Soil, grass, road and sand weights summing to one.
 */
export function sampleSurfaceWeights(
  alphamap: V2Alphamap,
  size: number,
  x: number,
  z: number,
  out: V2SurfaceWeights = [0, 0, 0, 0]
): V2SurfaceWeights {
  const r = alphamap.resolution,
    gx = Math.max(0, Math.min(r - 1, (x / size + 0.5) * r - 0.5)),
    gz = Math.max(0, Math.min(r - 1, (z / size + 0.5) * r - 0.5)),
    ix = Math.floor(gx),
    iz = Math.floor(gz),
    tx = gx - ix,
    tz = gz - iz,
    a = (iz * r + ix) * 4,
    b = (iz * r + Math.min(r - 1, ix + 1)) * 4,
    c = (Math.min(r - 1, iz + 1) * r + ix) * 4,
    d = (Math.min(r - 1, iz + 1) * r + Math.min(r - 1, ix + 1)) * 4,
    weights = alphamap.weights;
  for (let channel = 0; channel < 4; channel++) {
    out[channel] =
      ((weights[a + channel] * (1 - tx) + weights[b + channel] * tx) * (1 - tz) +
        (weights[c + channel] * (1 - tx) + weights[d + channel] * tx) * tz) /
      255;
  }
  return out;
}

/**
 * Mix the shared preview colors without discretizing surface categories.
 * @param weights Normalized physical RGBA weights.
 * @param out Optional reusable RGB byte-space tuple.
 * @returns A continuous RGB color in the range 0–255.
 */
export function blendSurfaceColor(
  weights: Readonly<V2SurfaceWeights>,
  out: V2SurfaceColor = [0, 0, 0]
): V2SurfaceColor {
  for (let component = 0; component < 3; component++) {
    out[component] = 0;
    for (let channel = 0; channel < 4; channel++)
      out[component] += V2_SURFACE_LAYERS[channel].color[component] * weights[channel];
  }
  return out;
}

/**
 * Sample the shared preview palette at a world position.
 * @param alphamap Published four-channel byte data.
 * @param size Square world size in metres.
 * @param x World X coordinate.
 * @param z World Z coordinate.
 * @param out Optional reusable RGB byte-space tuple; tight loops can reuse both tuples through the two lower-level functions.
 * @returns The bilinearly blended surface color.
 */
export function sampleSurfaceColor(
  alphamap: V2Alphamap,
  size: number,
  x: number,
  z: number,
  out: V2SurfaceColor = [0, 0, 0]
): V2SurfaceColor {
  return blendSurfaceColor(sampleSurfaceWeights(alphamap, size, x, z), out);
}
