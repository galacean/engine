import type { GroundAnimalMotion } from "./GroundAnimalSteering";

/** Convex map domain in metres; no terrain, traffic or route cache belongs here. */
export type AnimalFlightBounds =
  | { minX: number; maxX: number; minZ: number; maxZ: number }
  | { x: number; z: number; radius: number };

/** Constant-time map containment; static obstacles are validated by the route query. */
export function containsAnimalFlight(bounds: AnimalFlightBounds, x: number, z: number, radius: number): boolean {
  return "radius" in bounds
    ? Math.hypot(x - bounds.x, z - bounds.z) + radius <= bounds.radius
    : x >= bounds.minX + radius && x <= bounds.maxX - radius && z >= bounds.minZ + radius && z <= bounds.maxZ - radius;
}

/**
 * Start an inward turn with room for yaw acceleration and a half-circle at cruise speed.
 * Returns an inward heading, or undefined when no boundary correction is needed.
 * This is geometry, not a simulation of a future route; the live solver still limits yaw.
 */
export function animalFlightBoundaryHeading(
  bounds: AnimalFlightBounds,
  motion: Readonly<GroundAnimalMotion>,
  speed: number,
  angularSpeed: number,
  radius: number
): number | undefined {
  const margin = radius + Math.max(speed, motion.speed) * (2 + 2 / Math.max(0.05, angularSpeed));
  const hx = Math.sin(motion.heading),
    hz = Math.cos(motion.heading);
  let nx = 0,
    nz = 0;
  if ("radius" in bounds) {
    const dx = bounds.x - motion.x,
      dz = bounds.z - motion.z,
      distance = Math.hypot(dx, dz);
    if (distance > 0 && bounds.radius - distance < margin && (hx * dx + hz * dz) / distance < 0.5) {
      nx = dx / distance;
      nz = dz / distance;
    }
  } else {
    if (motion.x - bounds.minX < margin && hx < 0.5) nx += 1;
    if (bounds.maxX - motion.x < margin && hx > -0.5) nx -= 1;
    if (motion.z - bounds.minZ < margin && hz < 0.5) nz += 1;
    if (bounds.maxZ - motion.z < margin && hz > -0.5) nz -= 1;
  }
  return nx || nz ? Math.atan2(nx, nz) : undefined;
}

/** Reject short rearward goals that would require a slow tightening orbit. */
export function animalFlightApproachFits(
  motion: Readonly<GroundAnimalMotion>,
  target: readonly [number, number],
  cruise: number,
  angularSpeed: number,
  turnSpeedRatio = 0.65
): boolean {
  const dx = target[0] - motion.x,
    dz = target[1] - motion.z;
  const error = Math.atan2(
    Math.sin(Math.atan2(dx, dz) - motion.heading),
    Math.cos(Math.atan2(dx, dz) - motion.heading)
  );
  return (
    Math.hypot(dx, dz) >
    Math.max(0.3, cruise * (0.5 + (2 * turnSpeedRatio) / Math.max(0.05, angularSpeed)) * Math.sin(Math.abs(error) / 2))
  );
}
