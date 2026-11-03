import type { WaterOceanRepresentationStateV1 } from "../water/index";
import type { OceanWaterBodyDescriptorV1 } from "../water/runtime/ocean/index";

export type SeedWorldOceanPresentationMode = "orbit" | "roam";

/** Product camera envelope: 3072m Terrain authority plus a finite 512m deep-ocean belt per side. */
export const SEED_WORLD_OCEAN_PRESENTATION_SIZE_METRES = 4_096;

/** Both camera modes share the same finite authority and camera-relative graded Ocean topology. */
export function resolveSeedWorldOceanPresentationTopology(
  descriptor: Readonly<OceanWaterBodyDescriptorV1>,
  _mode: SeedWorldOceanPresentationMode
): Readonly<WaterOceanRepresentationStateV1> {
  const nearshore = descriptor.config.nearshoreDescriptor;
  if (!nearshore) {
    throw new Error("Seed World Ocean presentation requires the authoritative Nearshore world grid.");
  }
  const worldSizeX = nearshore.grid.cellSizeXZ[0] * nearshore.grid.width;
  const worldSizeZ = nearshore.grid.cellSizeXZ[1] * nearshore.grid.height;
  const centerXZ = Object.freeze([
    nearshore.grid.originXZ[0] + nearshore.grid.cellSizeXZ[0] * (nearshore.grid.width - 1) * 0.5,
    nearshore.grid.originXZ[1] + nearshore.grid.cellSizeXZ[1] * (nearshore.grid.height - 1) * 0.5
  ] as const);
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "ocean-surface-layout" as const,
    centerXZ,
    size: Math.max(SEED_WORLD_OCEAN_PRESENTATION_SIZE_METRES, worldSizeX, worldSizeZ),
    surfaceTopology: "finite" as const,
    finitePatchGridSize: 1,
    fixedLodCentralPatchGridSize: undefined,
    shoreViewEnvelope: undefined
  });
}
