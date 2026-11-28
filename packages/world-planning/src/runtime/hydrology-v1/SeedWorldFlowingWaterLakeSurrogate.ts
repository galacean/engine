import {
  SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION,
  type SeedWorldRiverV1,
  type SeedWorldTerrainPatchV1
} from "../../world/SeedWorldWorldEdit.ts";

const MINIMUM_SURROGATE_RADIUS_METRES = 5;
const MAXIMUM_SURROGATE_RADIUS_METRES = 500;

/**
 * Temporary Runtime policy while native flowing-water presentation is unavailable.
 *
 * The authored resource remains a stream/river everywhere outside the presentation
 * boundary. Only its terrain and water rendering footprint is represented by one
 * equal-area lake, so public Refs and semantic properties remain truthful.
 */
export function resolveSeedWorldFlowingWaterLakeSurrogateRadiusMetres(
  lengthMetres: number,
  widthMetres: number
): number {
  const equalAreaRadius = Math.sqrt((lengthMetres * widthMetres) / Math.PI);
  return Math.min(MAXIMUM_SURROGATE_RADIUS_METRES, Math.max(MINIMUM_SURROGATE_RADIUS_METRES, equalAreaRadius));
}

export function createSeedWorldFlowingWaterLakeSurrogateShapeV1(
  river: Readonly<SeedWorldRiverV1>
): Readonly<Extract<SeedWorldTerrainPatchV1["shape"], { kind: "radial-water-basin" }>> {
  const radiusMetres = resolveSeedWorldFlowingWaterLakeSurrogateRadiusMetres(
    river.lengthMillimetres / 1_000,
    river.widthMillimetres / 1_000
  );
  return Object.freeze({
    kind: "radial-water-basin",
    featureKind: "lake",
    centerXOffsetMillimetres: river.startXOffsetMillimetres,
    centerZOffsetMillimetres: river.startZOffsetMillimetres,
    radiusMillimetres: Math.round(radiusMetres * 1_000),
    depthMillimetres: river.depthMillimetres,
    shorelineIrregularityPermille: Math.round(350 + river.meanderPermille * 0.45),
    // The temporary flowing-water surrogate resolves its actual datum from the
    // excavated terrain at publication time; these authored-basin fields are
    // intentionally ignored by that explicit Runtime path.
    canonicalWaterLevelMillimetres: 0,
    surfaceLevelOffsetMillimetres: 0,
    seed: stableSeedFromResourceId(river.riverId)
  });
}

function stableSeedFromResourceId(resourceId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < resourceId.length; index++) {
    hash ^= resourceId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function createSeedWorldFlowingWaterLakeSurrogatePatchV1(
  river: Readonly<SeedWorldRiverV1>
): Readonly<SeedWorldTerrainPatchV1> {
  return Object.freeze({
    schemaVersion: SEED_WORLD_TERRAIN_PATCH_SCHEMA_VERSION,
    patchId: river.riverId,
    purpose: "water-body",
    shape: createSeedWorldFlowingWaterLakeSurrogateShapeV1(river),
    patchContentHash: river.riverContentHash
  });
}
