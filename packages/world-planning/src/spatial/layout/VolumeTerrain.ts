import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { Volume, VolumeBox } from "./Volumes";

/** Maximum sampled ground gradient under actual occupied boxes, in degrees.
 * Samples include footprint boundaries; compound gaps do not become occupied support area.
 * With stopAboveDegrees, returns as soon as a violating sample is found; the result is
 * then a lower bound used only for rejection, not a reported maximum.
 */
export function volumeGroundSlope(
  volume: Volume,
  ground: (point: PlanPoint) => number,
  stopAboveDegrees = Infinity
): number {
  let maximum = 0;
  for (const box of volume.boxes) {
    const nx = Math.max(1, Math.ceil(box.width / 2)),
      nz = Math.max(1, Math.ceil(box.depth / 2));
    const c = Math.cos(box.yaw),
      s = Math.sin(box.yaw);
    for (let ix = 0; ix <= nx; ix++)
      for (let iz = 0; iz <= nz; iz++) {
        const x = box.width * (ix / nx - 0.5),
          z = box.depth * (iz / nz - 0.5);
        const p = { x: box.center.x + x * c - z * s, z: box.center.z + x * s + z * c };
        const dx = ground({ x: p.x + 0.5, z: p.z }) - ground({ x: p.x - 0.5, z: p.z });
        const dz = ground({ x: p.x, z: p.z + 0.5 }) - ground({ x: p.x, z: p.z - 0.5 });
        maximum = Math.max(maximum, (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI);
        if (maximum > stopAboveDegrees) return maximum;
      }
  }
  return maximum;
}

/** Sink the full rotated base below its sampled footprint, not merely its centre. */
export function boxGroundBottom(
  box: Pick<VolumeBox, "center" | "width" | "depth" | "yaw">,
  ground: (p: PlanPoint) => number
): number {
  const nx = Math.max(1, Math.ceil(box.width)),
    nz = Math.max(1, Math.ceil(box.depth)),
    c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  let low = Infinity;
  for (let ix = 0; ix <= nx; ix++)
    for (let iz = 0; iz <= nz; iz++) {
      const x = box.width * (ix / nx - 0.5),
        z = box.depth * (iz / nz - 0.5);
      low = Math.min(low, ground({ x: box.center.x + x * c - z * s, z: box.center.z + x * s + z * c }));
    }
  return low - 0.05;
}
