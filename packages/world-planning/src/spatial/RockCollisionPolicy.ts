import type { IslandPlan } from "../semantic-study/IslandPlanModel.ts";

/**
 * Configurable rock/prop collision threshold.
 * Evaluated once during planning, template mounting, or authoring edits to resolve the
 * boolean `collision` switch consumed by PhysX colliders and animal OBB indices.
 */
export interface RockCollisionPolicy {
  /** Minimum horizontal footprint span (width or depth, in metres) required to auto-enable collision. */
  readonly minHorizontalM: number;
  /** Optional minimum height (in metres) required to auto-enable collision; omit to decide purely by footprint. */
  readonly minHeightM?: number;
}

/** Global default rock collision policy shared across templates unless overridden per template. */
export const DEFAULT_ROCK_COLLISION_POLICY: Readonly<RockCollisionPolicy> = Object.freeze({
  minHorizontalM: 2.0
});

/** Merges an optional template-level override with the global default policy. */
export function resolveRockCollisionPolicy(override?: Partial<RockCollisionPolicy>): RockCollisionPolicy {
  if (!override) return DEFAULT_ROCK_COLLISION_POLICY;
  return {
    minHorizontalM: override.minHorizontalM ?? DEFAULT_ROCK_COLLISION_POLICY.minHorizontalM,
    ...(override.minHeightM !== undefined
      ? { minHeightM: override.minHeightM }
      : DEFAULT_ROCK_COLLISION_POLICY.minHeightM !== undefined
        ? { minHeightM: DEFAULT_ROCK_COLLISION_POLICY.minHeightM }
        : {})
  };
}

/**
 * Resolves the boolean `collision` switch for one rock or authored model.
 * Explicit `collision` flags always win; omitted flags follow the configured size policy.
 */
export function resolveRockCollision(
  dimensions: {
    width?: number;
    depth?: number;
    height?: number;
    sizeX?: number;
    sizeZ?: number;
    sizeY?: number;
  },
  policy: RockCollisionPolicy = DEFAULT_ROCK_COLLISION_POLICY,
  explicitCollision?: boolean
): boolean {
  if (explicitCollision !== undefined) return explicitCollision;
  const width = dimensions.width ?? dimensions.sizeX;
  const depth = dimensions.depth ?? dimensions.sizeZ;
  const height = dimensions.height ?? dimensions.sizeY;
  if (width === undefined && depth === undefined && height === undefined) return true;
  if ((width ?? 0) >= policy.minHorizontalM || (depth ?? 0) >= policy.minHorizontalM) return true;
  if (policy.minHeightM !== undefined && (height ?? 0) >= policy.minHeightM) return true;
  return false;
}

/**
 * Stamps resolved `collision` switches onto rocks without an explicit flag in an `IslandPlan`.
 * Runs once per plan publication so downstream PhysX and OBB consumers only read the boolean switch.
 */
export function applyRockCollisionPolicyToPlan(
  plan: IslandPlan,
  policy: RockCollisionPolicy = DEFAULT_ROCK_COLLISION_POLICY
): void {
  for (const rock of plan.rocks) {
    if (!rock.boxes) continue;
    for (const box of rock.boxes) {
      if (box.collisionOverride !== undefined) {
        box.collision = box.collisionOverride;
      } else if (box.collision === undefined) {
        box.collision = resolveRockCollision(box, policy);
      }
    }
  }
  for (const item of plan.landscapes ?? []) {
    if (item.kind === "rock") {
      if (item.collisionOverride !== undefined) {
        item.collision = item.collisionOverride;
      } else if (item.collision === undefined) {
        item.collision = resolveRockCollision(item, policy);
      }
    }
  }
}
