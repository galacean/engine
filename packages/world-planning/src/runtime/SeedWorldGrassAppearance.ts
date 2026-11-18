import { GRASS_AUTHORED_HEIGHT_METRES } from "../world/SeedWorldAssetPlacementProfile.ts";
import type { SeedWorldPopulationPreview } from "./SeedWorldPopulationPlan.ts";

/** Full-coverage terrestrial grass density before ecology and distance LOD. */
export const SEED_WORLD_GRASS_DENSITY_PER_SQUARE_METRE = 15;
export const SEED_WORLD_GRASS_HEIGHT_METRES = Object.freeze({ minimum: 0.25, maximum: 0.55 });
export const SEED_WORLD_GRASS_UNIFORM_SCALE = Object.freeze({
  minimum: SEED_WORLD_GRASS_HEIGHT_METRES.minimum / GRASS_AUTHORED_HEIGHT_METRES,
  maximum: SEED_WORLD_GRASS_HEIGHT_METRES.maximum / GRASS_AUTHORED_HEIGHT_METRES
});

export const SEED_WORLD_GRASS_COVERAGE_RANGE = Object.freeze({ minimum: 0.186363637, maximum: 0.681818068 });

/** Roadside clumps shrink continuously while keeping the same candidate density. */
export function seedWorldGrassCoverageScale(coverage: number): number {
  const { minimum, maximum } = SEED_WORLD_GRASS_COVERAGE_RANGE;
  return Math.max(0, Math.min(1, (coverage - minimum) / (maximum - minimum)));
}

/** Preserve species proportions and exclusion rasters when expressing density in clumps/m². */
export function seedWorldTerrestrialGrassDensityMultiplier(
  layout: Pick<SeedWorldPopulationPreview, "detailSpeciesProfiles" | "detailDensityFields">,
  densityPerSquareMetre: number
): number {
  const families = new Set(
    layout.detailSpeciesProfiles
      .filter((profile) => profile.category === "grass" && profile.habitat === "terrestrial")
      .map((profile) => profile.key)
  );
  const authoredMaximum = layout.detailDensityFields.reduce(
    (sum, field) => sum + (families.has(field.prototypeFamily) ? field.maximumDensityPerSquareMetre : 0),
    0
  );
  return authoredMaximum > 0 ? densityPerSquareMetre / authoredMaximum : 0;
}
