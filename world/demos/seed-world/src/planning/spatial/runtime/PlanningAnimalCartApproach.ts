import { STORAGE_CART_OBSTACLES, STORAGE_CART_OPENING } from "@galacean/engine-farming/farming/presentation/storage/StorageContainerGeometry";
import type { PlanningAnimalFoodObstacle } from "./PlanningAnimalFoodClearance.ts";
import type { PlanningAnimalFoodTarget } from "./PlanningAnimalFood.ts";
import { planningAnimalFoodPathClear } from "./PlanningAnimalFoodClearance.ts";
import { groundAnimalArrivalRadius } from "@galacean/engine-animals/gameplay/animal/GroundAnimalSteering";

type Point = Readonly<{ x: number; z: number }>;

const CART_MIN_X = Math.min(...STORAGE_CART_OBSTACLES.map(p => p.min[0]));
const CART_MAX_X = Math.max(...STORAGE_CART_OBSTACLES.map(p => p.max[0]));
const CART_MIN_Z = Math.min(...STORAGE_CART_OBSTACLES.map(p => p.min[2]));
const CART_MAX_Z = Math.max(...STORAGE_CART_OBSTACLES.map(p => p.max[2]));
const CART_CLEARANCE = 0.15;

/** A ground stance facing into the cart's open end, and its next exterior approach waypoint. */
export interface PlanningAnimalCartApproach {
  readonly stance: { x: number; y: number; z: number };
  readonly heading: number;
  readonly next: readonly [number, number];
  readonly entering: boolean;
}

/**
 * Find a grounded stance behind the open end and route around the cart's exterior.
 * @param food Observed cargo including its container origin and yaw.
 * @param from Current animal ground position.
 * @param radius Existing crowd footprint, used on exterior route segments.
 * @param height Actual animal height.
 * @param ground Ground support sampler.
 * @param motion Animal length, current heading and whether this cargo's exterior approach has completed.
 * @returns A bounded local route, or undefined if the opening or stance cannot be reached.
 */
export function planningAnimalCartApproach(food: PlanningAnimalFoodTarget, from: Point, radius: number,
  height: number, ground: (x: number, z: number) => number | undefined,
  motion: Readonly<{ bodyLength: number; heading: number; entering?: boolean }>):
  PlanningAnimalCartApproach | undefined {
  if (food.appearance !== "cart" || !food.sourcePosition || food.sourceYaw === undefined) return undefined;
  const origin = food.sourcePosition, yaw = food.sourceYaw * Math.PI / 180;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const localX = (STORAGE_CART_OPENING.minX + STORAGE_CART_OPENING.maxX) / 2;
  if (food.y <= origin[1] + STORAGE_CART_OPENING.floorY) return undefined;
  const world = (x: number, z: number) => ({ x: origin[0] + x * cos + z * sin, z: origin[2] - x * sin + z * cos });
  const turnRadius = Math.max(0.1, motion.bodyLength * 0.75);
  const minX = CART_MIN_X - radius - CART_CLEARANCE - turnRadius;
  const maxX = CART_MAX_X + radius + CART_CLEARANCE + turnRadius;
  const maxZ = CART_MAX_Z + radius + CART_CLEARANCE + turnRadius;
  const z = CART_MIN_Z - radius - CART_CLEARANCE;
  const point = world(localX, z), y = ground(point.x, point.z);
  if (y === undefined || food.y > y + height) return undefined;
  const stance = { ...point, y };
  // Leave a body-sized turning arc before the straight final approach.
  const entryZ = z - Math.max(motion.bodyLength * 2, radius * 2);
  const entry = world(localX, entryZ);
  const fromX = (from.x - origin[0]) * cos - (from.z - origin[2]) * sin;
  const fromZ = (from.x - origin[0]) * sin + (from.z - origin[2]) * cos;
  const facing = Math.cos(motion.heading - yaw) >= Math.cos(Math.PI / 6);
  const atEntry = Math.hypot(from.x - entry.x, from.z - entry.z) <= groundAnimalArrivalRadius(motion.bodyLength) + 0.05;
  const onApproach = facing && Math.abs(fromX - localX) <= 0.12 && fromZ <= z + 0.06 && fromZ >= entryZ;
  if (motion.entering || atEntry || onApproach)
    return { stance, heading: yaw, next: [food.x, food.z], entering: true };
  const boxes: PlanningAnimalFoodObstacle[] = STORAGE_CART_OBSTACLES.map(part => ({ position: origin, yaw, min: part.min, max: part.max }));
  const points = [from, entry, world(minX, entryZ), world(maxX, entryZ), world(minX, maxZ), world(maxX, maxZ)];
  const distance = points.map(() => Infinity), previous = points.map(() => -1), used = points.map(() => false);
  distance[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let i = 0; i < points.length; i++) if (!used[i] && (current < 0 || distance[i] < distance[current])) current = i;
    if (current < 0 || !Number.isFinite(distance[current]) || current === 1) break;
    used[current] = true;
    for (let next = 1; next < points.length; next++) {
      if (used[next] || next === current) continue;
      const a = points[current], b = points[next], ay = ground(a.x, a.z), by = ground(b.x, b.z);
      if (ay === undefined || by === undefined ||
          !planningAnimalFoodPathClear(a, b, Math.min(ay, by), Math.max(ay, by) + height, radius, boxes)) continue;
      const cost = distance[current] + Math.hypot(b.x - a.x, b.z - a.z);
      if (cost < distance[next]) { distance[next] = cost; previous[next] = current; }
    }
  }
  if (!Number.isFinite(distance[1])) return undefined;
  let next = 1;
  while (previous[next] > 0) next = previous[next];
  return { stance, heading: yaw, next: [points[next].x, points[next].z], entering: false };
}
