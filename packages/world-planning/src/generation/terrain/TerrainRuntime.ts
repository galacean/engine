export { TerrainMapComponent, readTerrainMapPixels } from "@galacean/engine-terrain/terrain/TerrainMapComponent";
export { forEachDetailRoot } from "@galacean/engine-terrain/terrain/TerrainDetailPlacement";
export type { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
export type { TerrainLayerResolvedSource as TerrainLayer } from "@galacean/engine-terrain/terrain/clipmap/TerrainLayerResidency";
export {
  configureTerrainSurface,
  configureStylizedGrass,
  createStylizedTerrainDetailResources
} from "./StylizedTerrainMaterial";
export {
  createSeedWorldDetailInstancedMesh,
  DETAIL_TRANSFORM_FLOATS
} from "../../runtime/SeedWorldDetailInstancedMesh";
export {
  SEED_WORLD_GRASS_DENSITY_PER_SQUARE_METRE,
  SEED_WORLD_GRASS_HEIGHT_METRES
} from "../../runtime/SeedWorldGrassAppearance";
export { createSeedWorldSharedSurfaceTexture } from "@galacean/engine-vegetation/world/SeedWorldGrassColorFieldUniforms";
export {
  terrainShader,
  grassShader,
  flowerShader,
  grassGeometry,
  grassMaterialData,
  flowerPresets
} from "./StylizedTerrainPreset";
