/** CPU-only Terrain authoring boundary shared by producers and Water compilers. */
export { waterTerrainContentHash } from "./WaterTerrainIdentity";
export {
  captureWaterTerrainSnapshot,
  copyWaterTerrainSnapshot,
  cropWaterTerrainSnapshot,
  sampleWaterTerrainHeight
} from "./WaterTerrainSnapshot";
export type { WaterTerrainSnapshot } from "./WaterTerrainSnapshot";
