import type { SeedWorldSolvedRockObb } from "./SeedWorldRockAssemblySolver.ts";
import { sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";

type Vector3Tuple = readonly [x: number, y: number, z: number];

/** World-space ray used to select a compiled rock OBB. */
export interface SeedWorldRockSelectionRay {
  /** Ray origin in world metres. */
  readonly origin: Vector3Tuple;
  /** Ray direction in world axes. */
  readonly direction: Vector3Tuple;
}

/** Final-Heightmap hit used to record a missing-rock request. */
export interface SeedWorldTerrainRaycastHit {
  /** Distance from the ray origin in world metres. */
  readonly distance: number;
  /** Exact world-space point on Hfinal. */
  readonly position: Vector3Tuple;
}

/**
 * Selects the closest compiled rock OBB intersected by a world-space ray.
 * @param rocks Runtime-visible solved OBBs.
 * @param ray Camera ray in world space.
 * @returns Closest hit rock, or undefined when the ray misses every OBB.
 */
export function raycastSeedWorldRockObbs(
  rocks: readonly SeedWorldSolvedRockObb[],
  ray: SeedWorldRockSelectionRay
): SeedWorldSolvedRockObb | undefined {
  return rocks
    .map((rock) => Object.freeze({ rock, distance: intersectRayObb(ray, rock) }))
    .filter((hit): hit is Readonly<{ rock: SeedWorldSolvedRockObb; distance: number }> => hit.distance !== undefined)
    .sort((left, right) => left.distance - right.distance || left.rock.id.localeCompare(right.rock.id))[0]?.rock;
}

/**
 * Intersects a camera ray with the final baked Heightmap.
 * @param fields Final world Heightmap.
 * @param ray Camera ray in world space.
 * @returns Closest terrain hit inside the 3072m world, or undefined when the ray misses it.
 */
export function raycastSeedWorldTerrainHeightfield(
  fields: SeedWorldFields,
  ray: SeedWorldRockSelectionRay
): SeedWorldTerrainRaycastHit | undefined {
  const directionLength = Math.hypot(...ray.direction);
  if (!(directionLength > 1e-9)) return undefined;
  const direction = Object.freeze(ray.direction.map((value) => value / directionLength) as [number, number, number]);
  const half = fields.sizeMetres * 0.5;
  const interval = intersectRayWorldPlan(ray.origin, direction, half);
  if (!interval) return undefined;
  const start = Math.max(0, interval[0]);
  const end = interval[1];
  if (!(end >= start)) return undefined;
  const sampleGap = (distance: number): number | undefined => {
    const x = ray.origin[0] + direction[0] * distance;
    const z = ray.origin[2] + direction[2] * distance;
    const terrain = sampleSeedWorldHeight(fields, x, z);
    return terrain === undefined ? undefined : ray.origin[1] + direction[1] * distance - terrain;
  };
  const cellSize = fields.sizeMetres / Math.max(1, fields.heightResolution - 1);
  const step = Math.max(2, cellSize * 0.35);
  let previousDistance = start;
  let previousGap = sampleGap(previousDistance);
  if (previousGap !== undefined && previousGap <= 0) {
    return terrainHit(fields, ray.origin, direction, previousDistance);
  }
  for (let distance = Math.min(end, start + step); distance <= end + 1e-6; distance = Math.min(end, distance + step)) {
    const gap = sampleGap(distance);
    if (gap !== undefined && previousGap !== undefined && previousGap > 0 && gap <= 0) {
      let lower = previousDistance;
      let upper = distance;
      for (let iteration = 0; iteration < 18; iteration++) {
        const middle = (lower + upper) * 0.5;
        const middleGap = sampleGap(middle);
        if (middleGap !== undefined && middleGap > 0) lower = middle;
        else upper = middle;
      }
      return terrainHit(fields, ray.origin, direction, upper);
    }
    previousDistance = distance;
    previousGap = gap;
    if (distance === end) break;
  }
  return undefined;
}

function terrainHit(
  fields: SeedWorldFields,
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  distance: number
): SeedWorldTerrainRaycastHit | undefined {
  const x = origin[0] + direction[0] * distance;
  const z = origin[2] + direction[2] * distance;
  const height = sampleSeedWorldHeight(fields, x, z);
  return height === undefined
    ? undefined
    : Object.freeze({ distance, position: Object.freeze([x, height, z] as const) });
}

function intersectRayWorldPlan(
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  halfExtent: number
): readonly [entry: number, exit: number] | undefined {
  let entry = Number.NEGATIVE_INFINITY;
  let exit = Number.POSITIVE_INFINITY;
  for (const axis of [0, 2] as const) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (Math.abs(origin[axis]) > halfExtent) return undefined;
      continue;
    }
    const first = (-halfExtent - origin[axis]) / direction[axis];
    const second = (halfExtent - origin[axis]) / direction[axis];
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return undefined;
  }
  if (!Number.isFinite(entry)) entry = 0;
  if (!Number.isFinite(exit)) exit = halfExtent * 4;
  return exit < 0 ? undefined : Object.freeze([entry, exit] as const);
}

function intersectRayObb(ray: SeedWorldRockSelectionRay, rock: SeedWorldSolvedRockObb): number | undefined {
  const directionLength = Math.hypot(...ray.direction);
  if (!(directionLength > 1e-9)) return undefined;
  const inverseRotation = Object.freeze([
    -rock.obbRotationQuaternion[0],
    -rock.obbRotationQuaternion[1],
    -rock.obbRotationQuaternion[2],
    rock.obbRotationQuaternion[3]
  ] as const);
  const localOrigin = rotateVector(
    Object.freeze([
      ray.origin[0] - rock.obbCenter[0],
      ray.origin[1] - rock.obbCenter[1],
      ray.origin[2] - rock.obbCenter[2]
    ] as const),
    inverseRotation
  );
  const localDirection = rotateVector(ray.direction, inverseRotation);
  let nearest = 0;
  let farthest = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis++) {
    const halfSize = rock.obbSizeMetres[axis]! * 0.5;
    const origin = localOrigin[axis]!;
    const direction = localDirection[axis]!;
    if (Math.abs(direction) < 1e-9) {
      if (Math.abs(origin) > halfSize) return undefined;
      continue;
    }
    const first = (-halfSize - origin) / direction;
    const second = (halfSize - origin) / direction;
    nearest = Math.max(nearest, Math.min(first, second));
    farthest = Math.min(farthest, Math.max(first, second));
    if (nearest > farthest) return undefined;
  }
  return farthest >= 0 ? nearest : undefined;
}

function rotateVector(
  vector: Vector3Tuple,
  quaternion: readonly [x: number, y: number, z: number, w: number]
): Vector3Tuple {
  const [x, y, z, w] = quaternion;
  const tx = 2 * (y * vector[2] - z * vector[1]);
  const ty = 2 * (z * vector[0] - x * vector[2]);
  const tz = 2 * (x * vector[1] - y * vector[0]);
  return Object.freeze([
    vector[0] + w * tx + y * tz - z * ty,
    vector[1] + w * ty + z * tx - x * tz,
    vector[2] + w * tz + x * ty - y * tx
  ] as const);
}
