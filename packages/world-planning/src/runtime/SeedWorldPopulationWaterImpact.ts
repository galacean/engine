import { seedWorldOriginX, seedWorldOriginZ, type SeedWorldFields } from "./SeedWorldFields.ts";
import type { SeedWorldPopulationPreview } from "./SeedWorldPopulationPlan.ts";
import type { SeedWorldPopulationRuntimeCell } from "./SeedWorldPopulationRuntimeCell.ts";

/** Check actual compaction inputs in a cell's sampling support, rather than a union's empty interior.
 * Two texels cover the pixel-centred density footprint and the height-normal finite difference. */
export function seedWorldWaterDetailCellChanged(
  cell: Pick<SeedWorldPopulationRuntimeCell, "minimumWorldX" | "maximumWorldX" | "minimumWorldZ" | "maximumWorldZ">,
  before: SeedWorldFields,
  after: SeedWorldFields,
  oldLayout: SeedWorldPopulationPreview,
  layout: SeedWorldPopulationPreview
): boolean {
  if (
    seedWorldOriginX(before) !== seedWorldOriginX(after) ||
    seedWorldOriginZ(before) !== seedWorldOriginZ(after) ||
    JSON.stringify(oldLayout.detailSpeciesProfiles) !== JSON.stringify(layout.detailSpeciesProfiles)
  )
    return true;
  const changed = (
    a: ArrayLike<number> | undefined,
    b: ArrayLike<number> | undefined,
    resolution: number,
    channels = 1
  ) => {
    if (a === b) return false;
    if (!a || !b || a.length !== b.length) return true;
    const coordinate = (world: number, origin: number) => ((world - origin) / after.sizeMetres) * resolution;
    const x0 = Math.max(0, Math.floor(coordinate(cell.minimumWorldX, seedWorldOriginX(after))) - 2);
    const z0 = Math.max(0, Math.floor(coordinate(cell.minimumWorldZ, seedWorldOriginZ(after))) - 2);
    const x1 = Math.min(resolution - 1, Math.ceil(coordinate(cell.maximumWorldX, seedWorldOriginX(after))) + 2);
    const z1 = Math.min(resolution - 1, Math.ceil(coordinate(cell.maximumWorldZ, seedWorldOriginZ(after))) + 2);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        for (let channel = 0; channel < channels; channel++) {
          const index = (z * resolution + x) * channels + channel;
          if (a[index] !== b[index]) return true;
        }
    return false;
  };
  if (
    (!before.surfaceHeights || !after.surfaceHeights) &&
    JSON.stringify(before.heightDecode) !== JSON.stringify(after.heightDecode)
  )
    return true;
  if (
    changed(
      before.surfaceHeights ?? before.heightSamples,
      after.surfaceHeights ?? after.heightSamples,
      after.heightResolution
    ) ||
    changed(before.materialWeights, after.materialWeights, after.surfaceResolution, 4) ||
    changed(before.waterMask, after.waterMask, after.surfaceResolution)
  )
    return true;
  if (oldLayout.detailDensityFields.length !== layout.detailDensityFields.length) return true;
  for (const field of layout.detailDensityFields) {
    const old = oldLayout.detailDensityFields.find(
      (value) => value.prototypeFamily === field.prototypeFamily && value.assetProfileKey === field.assetProfileKey
    );
    if (
      !old ||
      old.resolution !== field.resolution ||
      old.maximumDensityPerSquareMetre !== field.maximumDensityPerSquareMetre ||
      (old.candidateSeed ?? old.hash) !== (field.candidateSeed ?? field.hash) ||
      changed(old.samples, field.samples, field.resolution) ||
      changed(old.heightRangeMetres?.samples, field.heightRangeMetres?.samples, field.resolution, 2)
    )
      return true;
  }
  return false;
}
