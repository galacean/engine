import { shapeCurve } from "./RecoveredWallConnectionHoles";
import type { RoofCurve } from "./RecoveredRoofMath";
import type { WallConnectionShape } from "./WallConnectionTypes";

/** Wall-local coordinates: footprint centre and orientation belong to the host
 * frame. Chord sampling must match the wall geometry, including curved walls. */
export function wallMountCurve(shape: WallConnectionShape): RoofCurve {
  return shapeCurve(
    shape.type === "circle"
      ? { ...shape, center: [0, 0], phase: 0 }
      : { ...shape, center: [0, 0], orientation: [1, 0] },
    0.5
  );
}

export function wallMountPoint(curve: RoofCurve, u: number, height: number): [number, number, number] {
  if (!Number.isFinite(u) || u < 0 || u > 1 || !Number.isFinite(height)) throw Error("Invalid wall mount");
  let i = 0;
  while (i < curve.knots.length - 2 && u > curve.knots[i + 1]) i++;
  const t = (u - curve.knots[i]) / (curve.knots[i + 1] - curve.knots[i]);
  const a = curve.points[i],
    b = curve.points[i + 1];
  return [a[0] + (b[0] - a[0]) * t, height, a[1] + (b[1] - a[1]) * t];
}

/** Project a physical mounting point to wall arclength in double precision.
 * The returned tangent also determines how a scaled attachment fits the wall. */
export function projectWallMount(curve: RoofCurve, point: readonly number[]) {
  if (point.length !== 3 || !point.every(Number.isFinite)) throw Error("Invalid wall mount point");
  let best = Infinity,
    u = 0,
    tangent = [1, 0];
  for (let i = 0; i < curve.points.length - 1; i++) {
    const a = curve.points[i],
      b = curve.points[i + 1],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[2] - a[1]) * dz) / (length * length)));
    const distance = Math.hypot(point[0] - a[0] - t * dx, point[2] - a[1] - t * dz);
    if (distance < best) {
      best = distance;
      u = curve.knots[i] + t * (curve.knots[i + 1] - curve.knots[i]);
      tangent = [dx / length, dz / length];
    }
  }
  if (best > 1e-4) throw Error("Mount point must lie on its host wall");
  return { u, bottom: point[1], tangent };
}
