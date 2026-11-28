/** Public Water entry. Internal modules retain direct imports. */
export type { WaterCompiledResourceReadPort } from "./body/WaterCompiledResource";
export { compileWaterConnections } from "./connections/WaterConnectionCompiler";
export type { CompiledWaterFootprintV1 } from "./generation/WaterFootprintCompiler";
export {
  WATER_GENERATION_TERRAIN_TILE_AXIS_COUNT,
  WaterGenerationCompileContextV1
} from "./generation/WaterGenerationCompileContext";
export type { WaterGenerationScopedTerrainViewV1 } from "./generation/WaterGenerationCompileContext";
export { HEIGHTFIELD_WATER_AGGREGATION_SCALE, HEIGHTFIELD_WATER_ATLAS_MAX_EDGE } from "./heightfield/constants";
export type { HeightfieldWaterCompiledData } from "./heightfield/HeightfieldWaterCompiledTypes";
export {
  HeightfieldWaterCompiler,
  computeHeightfieldWaterPhysicalSourceHash
} from "./heightfield/HeightfieldWaterCompiler";
export { validateHeightfieldWaterDescriptor } from "./heightfield/HeightfieldWaterValidator";
export { WaterRegionBathymetryCompiler, hashWaterRegionMask } from "./heightfield/WaterRegionBathymetryCompiler";
export {
  decodeLakeBoundary,
  sampleLakeBoundary,
  sampleLakeSignedShoreDistance,
  triangulateLakeBoundary
} from "./lake/LakeBoundaryCompiler";
export { attachLakeGridBoundary } from "./lake/LakeGridBoundaryAdapter";
export { captureLakeTerrain } from "./lake/LakeTerrainAdapter";
export { resolveLakeTerrainBoundary } from "./lake/LakeTerrainBoundary";
export type { LakeTerrainSnapshot, LakeTerrainView } from "./lake/LakeTerrainBoundary";
export {
  OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES,
  OCEAN_NEARSHORE_HARD_BUDGET
} from "./ocean/constants";
export { createOceanNearshoreFromTerrain } from "./ocean/OceanTerrainCompiler";
export {
  RIVER_COMPILER_SEMANTIC_VERSION,
  RIVER_MAX_WATER_SURFACE_SLOPE,
  RIVER_TERRAIN_CORRIDOR_COMPONENT
} from "./river/constants";
export { resolveRiverRibbonJoinFrames } from "./river/RiverRibbonJoinResolver";
export type { RiverTerrainInteractionData, RiverTerrainReachCorridorData } from "./river/types";
export {
  CANONICAL_WATER_ENCODING_VERSION,
  CANONICAL_WATER_HASH_ALGORITHM,
  CanonicalWaterBinaryWriterV1,
  CanonicalWaterByteCollector,
  bytesToHex,
  canonicalSha256HexToBytes,
  compareCanonicalBytes,
  createCanonicalWaterHashWriter,
  isCanonicalSha256Hex
} from "./shared/CanonicalWaterBinaryWriterV1";
export type { CanonicalUint64Lanes } from "./shared/CanonicalWaterBinaryWriterV1";
export { hashRiverStableValue, hashStableValue } from "./shared/determinism";
export type { WaterSurfaceAppearanceVariantKey } from "./surface/CompiledWaterSurfaceAppearanceTypes";
export { numericContentIdentity } from "./shared/numericIdentity";
