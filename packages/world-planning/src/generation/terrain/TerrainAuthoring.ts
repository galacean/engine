export {
  generateTerrainIsland,
  previewTerrainIsland,
  TerrainIslandGenerationError,
  type TerrainIslandShape
} from "./TerrainIslandGenerator";
export type TerrainHydrologyResult = ReturnType<typeof import("./TerrainHydrology").generateTerrainHydrology>;
export {
  generateStylizedTerrainAlbedo,
  generateStylizedTerrainMaps
} from "@galacean/engine-terrain/terrain/tools/StylizedTerrainAssets";
export type { PlanPoint as TerrainPoint } from "../../semantic-study/IslandPlanModel";
