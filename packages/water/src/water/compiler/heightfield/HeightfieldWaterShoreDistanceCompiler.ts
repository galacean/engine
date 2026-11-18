import type { HeightfieldWaterGridConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import { squaredWaterGridDistances, WaterGridDistanceWorkspace } from "../shared/WaterGridDistanceTransform";

/** Canonical signed metres at source texel centres. A wet texel owns its closed
 * cell rectangle; the exterior is dry. Positive is wet, negative is dry.
 * A closest point on an axis-aligned cell edge is either its midpoint (the query
 * centre projects inside that edge) or an endpoint. Three staggered site lattices
 * therefore give exact centre distances before Float32 storage quantization,
 * including non-square cells and dry padding,
 * without a doubled-resolution grid or a second distance-transform implementation.
 * Production callers validate at least one wet cell; an empty mask has no boundary.
 */
export function compileHeightfieldWaterShoreDistances(
  mask: Uint8Array,
  grid: HeightfieldWaterGridConfig
): Float32Array {
  const {
    width,
    height,
    cellSizeXZ: [spacingX, spacingZ]
  } = grid;
  if (mask.length !== width * height) throw new RangeError("Water shoreline mask does not match its source grid.");
  const wet = (x: number, z: number) => x >= 0 && z >= 0 && x < width && z < height && mask[z * width + x] === 1;
  const vertical = (x: number, z: number) => z >= 0 && z < height && wet(x - 1, z) !== wet(x, z);
  const horizontal = (x: number, z: number) => x >= 0 && x < width && wet(x, z - 1) !== wet(x, z);
  const workspace = new WaterGridDistanceWorkspace();
  // Allocate once for the largest staggered lattice, including the corner sites.
  workspace.prepare(Math.max(width + 1, height + 1), width * (height + 1));
  const options = { spacingX, spacingZ, outputWidth: width, outputHeight: height, workspace };
  const distances = new Float32Array(width * height).fill(Number.POSITIVE_INFINITY);
  const merge = (squared: Float64Array) => {
    for (let i = 0; i < distances.length; i++) distances[i] = Math.min(distances[i], Math.sqrt(squared[i]));
  };
  merge(squaredWaterGridDistances(width + 1, height, vertical, { ...options, offsetX: 0.5 }));
  merge(squaredWaterGridDistances(width, height + 1, horizontal, { ...options, offsetZ: 0.5 }));
  merge(
    squaredWaterGridDistances(
      width + 1,
      height + 1,
      (x, z) => vertical(x, z - 1) || vertical(x, z) || horizontal(x - 1, z) || horizontal(x, z),
      { ...options, offsetX: 0.5, offsetZ: 0.5 }
    )
  );
  for (let i = 0; i < distances.length; i++) if (mask[i] !== 1) distances[i] = -distances[i];
  return distances;
}
