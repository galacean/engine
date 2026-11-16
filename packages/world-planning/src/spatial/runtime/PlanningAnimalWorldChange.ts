import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";

const snapshotIds = new WeakMap<IslandPlan, number>();
let nextSnapshotId = 0;

/** Opaque snapshot identity. Change notifications must not retain an entire retired world plan. */
export function planningAnimalSnapshotId(plan: IslandPlan): number {
  let id = snapshotIds.get(plan);
  if (id === undefined) snapshotIds.set(plan, (id = ++nextSnapshotId));
  return id;
}

export interface AnimalWorldBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Undefined means unknown/full invalidation; empty arrays prove no animal-facing change. */
export interface PlanningAnimalWorldChange {
  readonly previousSnapshot: number;
  readonly terrain: readonly AnimalWorldBounds[];
  readonly water: readonly AnimalWorldBounds[];
  readonly obstacles: readonly AnimalWorldBounds[];
  readonly surface: readonly AnimalWorldBounds[];
}

export function emptyAnimalWorldChange(previousPlan: IslandPlan): PlanningAnimalWorldChange {
  return {
    previousSnapshot: planningAnimalSnapshotId(previousPlan),
    terrain: [],
    water: [],
    obstacles: [],
    surface: []
  };
}

/** Preserve every pending publication; never apply a delta against a different base. */
export function mergeAnimalWorldChanges(
  before: PlanningAnimalWorldChange | undefined,
  after: PlanningAnimalWorldChange | undefined
): PlanningAnimalWorldChange | undefined {
  if (!before || !after) return;
  return {
    previousSnapshot: before.previousSnapshot,
    terrain: [...before.terrain, ...after.terrain],
    water: [...before.water, ...after.water],
    obstacles: [...before.obstacles, ...after.obstacles],
    surface: [...before.surface, ...after.surface]
  };
}

/** Compare the same collision primitives consumed by animal habitat, excluding materials and labels. */
export function animalContentChange(
  before: IslandPlan,
  after: IslandPlan,
  height: (x: number, z: number) => number
): PlanningAnimalWorldChange | undefined {
  if (!before.parameters || !after.parameters || !before.rocks || !after.rocks) return;
  for (const key of ["seed", "width", "depth"] as const) if (before.parameters[key] !== after.parameters[key]) return;
  for (const key of ["spawn", "bridges", "roadApproaches", "waters"] as const)
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return;
  return { ...emptyAnimalWorldChange(before), obstacles: animalCollisionChanges(before, after, height, height) };
}

export function animalCollisionChanges(
  before: IslandPlan,
  after: IslandPlan,
  beforeHeight: (x: number, z: number) => number,
  afterHeight: (x: number, z: number) => number
): AnimalWorldBounds[] {
  const shapes = (plan: IslandPlan, height: (x: number, z: number) => number) => {
    const result = new Map<string, { signature: string; bounds: AnimalWorldBounds }>();
    for (const part of planningWhiteboxes(plan, (p) => height(p.x, p.z))) {
      if (part.layer === "bridge") continue;
      part.boxes.forEach((box, i) => {
        if (!box.collision) return;
        const x = box.center.x,
          z = box.center.z;
        const dx = (Math.abs(Math.cos(box.yaw)) * box.sizeX + Math.abs(Math.sin(box.yaw)) * box.sizeZ) / 2;
        const dz = (Math.abs(Math.sin(box.yaw)) * box.sizeX + Math.abs(Math.cos(box.yaw)) * box.sizeZ) / 2;
        result.set(`${part.layer}:${part.id}:${i}`, {
          signature: JSON.stringify([x, z, box.sizeX, box.sizeY, box.sizeZ, box.yaw, box.elevation ?? height(x, z)]),
          bounds: { minX: x - dx, maxX: x + dx, minZ: z - dz, maxZ: z + dz }
        });
      });
    }
    return result;
  };
  const old = shapes(before, beforeHeight),
    next = shapes(after, afterHeight),
    obstacles: AnimalWorldBounds[] = [];
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const a = old.get(key),
      b = next.get(key);
    if (a?.signature === b?.signature) continue;
    if (a) obstacles.push(a.bounds);
    if (b) obstacles.push(b.bounds);
  }
  return obstacles;
}

/** A water-only level edit retains terrain. Include both old and new footprints, including removals. */
export function animalWaterChange(
  before: IslandPlan,
  after: IslandPlan,
  update: { bodyId: string; surface: boolean }
): PlanningAnimalWorldChange | undefined {
  if (update.surface === false) return emptyAnimalWorldChange(before);
  if (update.surface !== true) return;
  const water: AnimalWorldBounds[] = [];
  for (const plan of [before, after]) {
    const body = plan.waters?.find((value) => value.id === update.bodyId);
    if (!body?.outline.length) return;
    water.push({
      minX: Math.min(...body.outline.map((p) => p.x)) - 1e-4,
      minZ: Math.min(...body.outline.map((p) => p.z)) - 1e-4,
      maxX: Math.max(...body.outline.map((p) => p.x)) + 1e-4,
      maxZ: Math.max(...body.outline.map((p) => p.z)) + 1e-4
    });
  }
  return { ...emptyAnimalWorldChange(before), water };
}
