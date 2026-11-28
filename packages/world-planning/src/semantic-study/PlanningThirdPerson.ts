import type { V2Box } from "../spatial/V2Model.ts";
type Point = { x: number; y: number; z: number };

/** Body-relative chase camera, with conservative OBB clearance and sampled FBM clearance.
 * Does not change actor coordinates, FOV, movement speed, or layout geometry.
 */
export function thirdPersonCamera(
  feet: Point,
  height: number,
  yaw: number,
  pitch: number,
  boxes: V2Box[],
  ground: (p: { x: number; z: number }) => number
) {
  const target = { x: feet.x, y: feet.y + height * 0.8, z: feet.z };
  const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  const clearance = 0.2;
  let distance = height * 3;
  for (const b of boxes) {
    if (!b.collision) continue;
    const c = Math.cos(b.yaw),
      s = Math.sin(b.yaw),
      dx = target.x - b.center.x,
      dz = target.z - b.center.z;
    const origin = [c * dx + s * dz, target.y - (b.elevation ?? ground(b.center)) - b.sizeY / 2, -s * dx + c * dz];
    const ray = [c * direction.x + s * direction.z, direction.y, -s * direction.x + c * direction.z];
    const half = [b.sizeX / 2 + clearance, b.sizeY / 2 + clearance, b.sizeZ / 2 + clearance];
    let entry = 0,
      exit = distance;
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(ray[axis]) < 1e-8) {
        if (Math.abs(origin[axis]) > half[axis]) {
          exit = -1;
          break;
        }
      } else {
        const a = (-half[axis] - origin[axis]) / ray[axis],
          z = (half[axis] - origin[axis]) / ray[axis];
        entry = Math.max(entry, Math.min(a, z));
        exit = Math.min(exit, Math.max(a, z));
      }
    }
    if (entry <= exit) distance = Math.min(distance, Math.max(0, entry - 0.02));
  }
  const at = (d: number) => ({
    x: target.x + direction.x * d,
    y: target.y + direction.y * d,
    z: target.z + direction.z * d
  });
  for (let d = 0; d <= distance; d += 0.1) {
    const p = at(d);
    if (p.y < ground(p) + clearance) {
      distance = Math.max(0, d - 0.1);
      break;
    }
  }
  return { target, position: at(Math.max(0.001, distance)), distance };
}
