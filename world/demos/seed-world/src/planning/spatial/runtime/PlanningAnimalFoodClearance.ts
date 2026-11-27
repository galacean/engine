/** Cached storage collision box in container-local metres. */
export interface PlanningAnimalFoodObstacle {
  readonly position: readonly number[];
  readonly yaw: number;
  readonly min: readonly number[];
  readonly max: readonly number[];
}

/**
 * Sweep an animal's conservative ground footprint against measured container parts.
 * @param from Previous horizontal root position.
 * @param to Proposed horizontal root position.
 * @param bottom Lowest support elevation along this short motion segment.
 * @param top Highest body elevation along the segment.
 * @param radius Existing ground collision radius, in metres.
 * @param obstacles Cached part boxes; empty space between parts remains traversable.
 * @returns False when the swept footprint overlaps a part at the animal's elevation.
 */
export function planningAnimalFoodPathClear(from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>, bottom: number, top: number, radius: number,
  obstacles: readonly PlanningAnimalFoodObstacle[]): boolean {
  for (const box of obstacles) {
    if (top <= box.position[1] + box.min[1] || bottom >= box.position[1] + box.max[1]) continue;
    const cosine = Math.cos(box.yaw), sine = Math.sin(box.yaw);
    const x = (from.x - box.position[0]) * cosine - (from.z - box.position[2]) * sine;
    const z = (from.x - box.position[0]) * sine + (from.z - box.position[2]) * cosine;
    const dx = (to.x - from.x) * cosine - (to.z - from.z) * sine;
    const dz = (to.x - from.x) * sine + (to.z - from.z) * cosine;
    const minX = box.min[0] - radius, maxX = box.max[0] + radius;
    const minZ = box.min[2] - radius, maxZ = box.max[2] + radius;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      // A moved cart or newly discovered collider must not trap an existing animal.
      // Permit only motion reducing penetration; stationary feeding still fails.
      const penetration = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
      const outward = x - minX <= penetration + 1e-9 && dx < 0 ||
        maxX - x <= penetration + 1e-9 && dx > 0 ||
        z - minZ <= penetration + 1e-9 && dz < 0 ||
        maxZ - z <= penetration + 1e-9 && dz > 0;
      if (outward) continue;
    }
    let enter = 0, exit = 1;
    for (let axis = 0; axis < 2; axis++) {
      const origin = axis ? z : x, delta = axis ? dz : dx, index = axis ? 2 : 0;
      const min = box.min[index] - radius, max = box.max[index] + radius;
      if (Math.abs(delta) < 1e-9) {
        if (origin < min || origin > max) { enter = 2; break; }
      } else {
        const a = (min - origin) / delta, b = (max - origin) / delta;
        enter = Math.max(enter, Math.min(a, b));
        exit = Math.min(exit, Math.max(a, b));
      }
    }
    if (enter <= exit) return false;
  }
  return true;
}
