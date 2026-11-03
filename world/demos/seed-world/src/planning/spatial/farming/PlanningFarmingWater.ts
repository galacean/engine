import type { GroundBounds } from "@galacean/engine-farming/farming/api/index";
import { createWaterSpatialFieldSample, type WaterSpatialFieldSnapshot } from "@galacean/engine-water/water/runtime/index";
import type { createPlanningFarmingTerrainQuery } from "./PlanningFarmingTerrain.ts";

/** A range certificate separates the entire rectangle; samples are witnesses only, never dry proof. */
export function createPlanningFarmingWaterInspection(
  fields: readonly WaterSpatialFieldSnapshot[],
  terrain: ReturnType<typeof createPlanningFarmingTerrainQuery>,
  maximumRegions = 4096
) {
  const captured = [...fields];
  if (!Number.isSafeInteger(maximumRegions) || maximumRegions <= 0) throw new Error("Invalid water footprint budget");
  for (const field of captured)
    if (!field.maximumSurfaceHeightInBounds)
      throw new Error(`WATER_BOUNDS_QUERY_UNAVAILABLE: ${field.metadata.compiledHash} 无完整范围查询`);
  return (bounds: GroundBounds): boolean => {
    for (const field of captured) {
      const pending = [{ bounds, depth: 0 }],
        sample = createWaterSpatialFieldSample();
      let visited = 0;
      while (pending.length) {
        if (++visited > maximumRegions)
          throw new Error(
            `WATER_FOOTPRINT_SEARCH_EXHAUSTED: ${field.metadata.compiledHash} 超过 ${maximumRegions} 个范围，无法确认设施占地是否淹没`
          );
        const { bounds: b, depth } = pending.pop()!;
        const upper = field.maximumSurfaceHeightInBounds!({
          minX: b.minimumX,
          maxX: b.maximumX,
          minZ: b.minimumZ,
          maxZ: b.maximumZ
        });
        if (upper === null) continue;
        if (!Number.isFinite(upper)) throw new Error(`WATER_BOUNDS_QUERY_INVALID: ${field.metadata.compiledHash}`);
        const ground = terrain.inspectBounds(b);
        if (!ground.covered) throw new Error("WATER_GROUND_QUERY_UNAVAILABLE: 地形占地范围不完整");
        if (ground.minimumHeight > upper) continue;
        const mx = (b.minimumX + b.maximumX) / 2,
          mz = (b.minimumZ + b.maximumZ) / 2;
        for (const x of [b.minimumX, mx, b.maximumX])
          for (const z of [b.minimumZ, mz, b.maximumZ]) {
            const height = terrain.sample(x, z)?.position[1];
            if (
              height !== undefined &&
              field.sampleSpatialField(x, z, sample) &&
              sample.wet &&
              sample.waterDepth > 0 &&
              height <= sample.surfaceHeight
            )
              return true;
          }
        if (depth >= 40 || (mx === b.minimumX && mz === b.minimumZ))
          throw new Error(`WATER_FOOTPRINT_PRECISION_LIMIT: ${field.metadata.compiledHash} 岸线接触范围未能判定`);
        if (b.maximumX - b.minimumX >= b.maximumZ - b.minimumZ && mx > b.minimumX && mx < b.maximumX) {
          pending.push(
            { bounds: { ...b, maximumX: mx }, depth: depth + 1 },
            { bounds: { ...b, minimumX: mx }, depth: depth + 1 }
          );
        } else if (mz > b.minimumZ && mz < b.maximumZ) {
          pending.push(
            { bounds: { ...b, maximumZ: mz }, depth: depth + 1 },
            { bounds: { ...b, minimumZ: mz }, depth: depth + 1 }
          );
        } else throw new Error(`WATER_FOOTPRINT_PRECISION_LIMIT: ${field.metadata.compiledHash}`);
      }
    }
    return false;
  };
}
