import type { WaterTerrainSnapshot } from "../terrain/WaterTerrainSnapshot";

/** Authored datum and external terrain published together; waves remain a rendering concern. */
export interface OceanEditDocument {
  readonly waterLevel: number;
  readonly terrain: WaterTerrainSnapshot;
}
