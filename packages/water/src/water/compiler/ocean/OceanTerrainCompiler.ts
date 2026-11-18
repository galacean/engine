import type { OceanEditDocument } from "../../authoring/ocean/OceanEditDocument";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import { OceanNearshoreOutsidePolicy } from "../../authoring/ocean/OceanNearshoreTypes";
import { isWaterTerrainSnapshot, sampleWaterTerrainHeight } from "../../authoring/terrain/WaterTerrainSnapshot";
import { OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH } from "./constants";

/**
 * Ownership is independent of today's wet mask: dry eligible coast can flood, other water bodies cannot.
 * Only edge-connected submerged cells belong to the sea; enclosed low basins stay dry.
 * Rebuild the bounded atlas on authoring submission, never in the frame loop.
 */
export function createOceanNearshoreFromTerrain(
  template: Omit<OceanNearshoreDescriptorV1, "bedHeights">,
  ownership: Uint8Array,
  document: OceanEditDocument
): OceanNearshoreDescriptorV1 {
  if (!Number.isFinite(document.waterLevel) || !isWaterTerrainSnapshot(document.terrain))
    throw new Error("Ocean editing requires a finite water level and complete terrain snapshot.");
  const { grid, outsidePolicy } = template;
  const { width, height } = grid;
  const count = width * height;
  if (
    !Number.isInteger(width) ||
    width < 2 ||
    !Number.isInteger(height) ||
    height < 2 ||
    count > 1_048_576 ||
    !grid.cellSizeXZ.every((v) => Number.isFinite(v) && v > 0) ||
    !grid.originXZ.every(Number.isFinite) ||
    ownership.length !== count ||
    ownership.some((v) => v !== 0 && v !== 1)
  )
    throw new Error("Ocean editing requires a bounded grid and binary ownership for every cell.");
  const minimumDepth = template.wetSource.minimumDepth ?? OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH;
  if (!Number.isFinite(minimumDepth) || minimumDepth < 0) throw new Error("Invalid Ocean minimum depth.");
  const bedHeights = new Float32Array(count);
  const eligible = new Uint8Array(count);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const i = row * width + column;
      const bed = sampleWaterTerrainHeight(
        document.terrain,
        grid.originXZ[0] + column * grid.cellSizeXZ[0],
        grid.originXZ[1] + row * grid.cellSizeXZ[1]
      );
      if (bed === undefined) throw new Error(`Ocean terrain does not cover nearshore cell ${column},${row}.`);
      bedHeights[i] = bed;
      eligible[i] = ownership[i] && document.waterLevel - bedHeights[i] > minimumDepth ? 1 : 0;
    }
  }
  const mask = new Uint8Array(count),
    queue = new Uint32Array(count);
  let read = 0,
    write = 0;
  const visit = (i: number) => {
    if (eligible[i] && !mask[i]) {
      mask[i] = 1;
      queue[write++] = i;
    }
  };
  const deep = OceanNearshoreOutsidePolicy.DeepOcean;
  for (let x = 0; x < width; x++) {
    if (outsidePolicy.negativeZ === deep) visit(x);
    if (outsidePolicy.positiveZ === deep) visit((height - 1) * width + x);
  }
  for (let z = 0; z < height; z++) {
    if (outsidePolicy.negativeX === deep) visit(z * width);
    if (outsidePolicy.positiveX === deep) visit(z * width + width - 1);
  }
  while (read < write) {
    const i = queue[read++],
      x = i % width;
    if (x > 0) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < count) visit(i + width);
  }
  // An authored SDF describes the old coast and must never survive a terrain/datum edit.
  const { signedShoreDistances: _oldShore, ...base } = template;
  return {
    ...base,
    grid: { ...grid, originXZ: [...grid.originXZ], cellSizeXZ: [...grid.cellSizeXZ] },
    outsidePolicy: { ...outsidePolicy },
    ...(base.budget ? { budget: { ...base.budget } } : {}),
    waterLevel: document.waterLevel,
    bedHeights,
    wetSource: { kind: "mask", mask, minimumDepth }
  };
}
