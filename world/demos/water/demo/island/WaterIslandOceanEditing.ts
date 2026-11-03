import type { OceanNearshoreGridConfig } from "@galacean/engine-water/water/index";
import {
  captureWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "@galacean/engine-water/water/index";
import { createWaterIslandSource, islandOceanMayFloodPoint } from "./WaterIslandTerrain.ts";

export function createIslandOceanOwnership(
  source: ReturnType<typeof createWaterIslandSource>,
  grid: OceanNearshoreGridConfig
) {
  const ownership = new Uint8Array(grid.width * grid.height);
  for (let z = 0; z < grid.height; z++)
    for (let x = 0; x < grid.width; x++) {
      ownership[z * grid.width + x] = islandOceanMayFloodPoint(
        grid.originXZ[0] + x * grid.cellSizeXZ[0],
        grid.originXZ[1] + z * grid.cellSizeXZ[1],
        source.connections.byBody
      )
        ? 1
        : 0;
    }
  return ownership;
}

/** Bounded beach edit, independent of sea level. The immutable previous terrain remains undoable. */
export function editIslandCoast(terrain: WaterTerrainSnapshot, deltaMetres: number): WaterTerrainSnapshot {
  if (!Number.isFinite(deltaMetres) || Math.abs(deltaMetres) > 2)
    throw new RangeError("Coast edit must be within ±2 metres.");
  return captureWaterTerrainSnapshot({ ...terrain, revision: terrain.revision + 1 }, (x, z) => {
    const bed = sampleWaterTerrainHeight(terrain, x, z)!;
    const t = Math.max(0, 1 - Math.hypot(x + 214, z) / 12);
    return bed + deltaMetres * t * t * (3 - 2 * t);
  });
}
