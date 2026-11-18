import type { FarmItemType } from "../domain/FarmItems";
import type { GroundTarget, PlotGrid } from "../domain/FarmingGround";

export const FARM_WORK_REACH = Object.freeze({ distance: 1.6, minimum: 0.8, maximum: 2.35, lateral: 0.75 });
export function isNearbyFarmTool(type: FarmItemType | undefined): boolean {
  return type === "hoe" || type === "watering-can";
}

/** A short, fixed reach in front of the player; camera pitch never extends the reach. */
export function farmWorkCandidates(
  grid: PlotGrid,
  groundId: string,
  eye: readonly [number, number, number],
  forward: readonly [number, number, number]
): { target: GroundTarget; x: number; z: number; score: number }[] {
  const length = Math.hypot(forward[0], forward[2]);
  if (length < 0.001) return [];
  const dx = forward[0] / length,
    dz = forward[2] / length;
  const cx = Math.floor((eye[0] + dx * FARM_WORK_REACH.distance - grid.originX) / grid.cellSize);
  const cz = Math.floor((eye[2] + dz * FARM_WORK_REACH.distance - grid.originZ) / grid.cellSize);
  const candidates = [];
  for (let ix = cx - 1; ix <= cx + 1; ix++)
    for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const x = grid.originX + (ix + 0.5) * grid.cellSize;
      const z = grid.originZ + (iz + 0.5) * grid.cellSize;
      const rx = x - eye[0],
        rz = z - eye[2];
      const ahead = rx * dx + rz * dz;
      const lateral = Math.abs(rx * dz - rz * dx);
      if (
        ahead < FARM_WORK_REACH.minimum ||
        Math.hypot(rx, rz) > FARM_WORK_REACH.maximum ||
        lateral > FARM_WORK_REACH.lateral
      )
        continue;
      candidates.push({
        target: { groundId, cellX: ix, cellZ: iz },
        x,
        z,
        score: (ahead - FARM_WORK_REACH.distance) ** 2 + lateral ** 2 * 2
      });
    }
  return candidates.sort((a, b) => a.score - b.score);
}
