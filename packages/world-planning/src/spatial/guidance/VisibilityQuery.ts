import type { V2Box } from "../V2Model.ts";
export interface Point3 {
  x: number;
  y: number;
  z: number;
}
export interface Observer {
  position: Point3;
  forward: Point3;
  verticalFovDegrees: number;
  aspect: number;
  columns: number;
  rows: number;
  terrainStepM: number;
  nearM: number;
}
export interface Occluder {
  ownerId: string;
  box: V2Box;
}
/** Return the first forward intersection with an oriented solid box, in metres. */
export function rayBox(origin: Point3, direction: Point3, b: V2Box): number {
  const c = Math.cos(b.yaw),
    s = Math.sin(b.yaw),
    dx = origin.x - b.center.x,
    dz = origin.z - b.center.z;
  const o = [dx * c + dz * s, origin.y - (b.elevation ?? 0) - b.sizeY / 2, -dx * s + dz * c],
    d = [direction.x * c + direction.z * s, direction.y, -direction.x * s + direction.z * c],
    half = [b.sizeX / 2, b.sizeY / 2, b.sizeZ / 2];
  let low = 0,
    high = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-10) {
      if (Math.abs(o[i]) > half[i]) return Infinity;
      continue;
    }
    const a = (-half[i] - o[i]) / d[i],
      z = (half[i] - o[i]) / d[i];
    low = Math.max(low, Math.min(a, z));
    high = Math.min(high, Math.max(a, z));
    if (low > high) return Infinity;
  }
  return low;
}
/** Estimate target projection and visibility using fixed viewport ray samples.
 * Uses actual OBBs and shared terrain; POI circles and editor layer toggles are absent.
 * This is a CPU sampled estimate, not a GPU pixel mask or perceptual-attention score.
 */
export function measureVisibility(
  observer: Observer,
  solids: Occluder[],
  targetIds: ReadonlySet<string>,
  ground: (p: { x: number; z: number }) => number
) {
  if (
    ![
      observer.position.x,
      observer.position.y,
      observer.position.z,
      observer.forward.x,
      observer.forward.y,
      observer.forward.z,
      observer.aspect,
      observer.verticalFovDegrees,
      observer.terrainStepM,
      observer.nearM
    ].every(Number.isFinite) ||
    !Number.isInteger(observer.columns) ||
    !Number.isInteger(observer.rows) ||
    observer.columns < 1 ||
    observer.rows < 1 ||
    observer.columns > 512 ||
    observer.rows > 512 ||
    observer.aspect <= 0 ||
    observer.terrainStepM <= 0 ||
    observer.nearM <= 0 ||
    observer.verticalFovDegrees <= 0 ||
    observer.verticalFovDegrees >= 175 ||
    Math.hypot(observer.forward.x, observer.forward.z) < 1e-8
  )
    throw new Error("观察条件无效或超出采样预算");
  const target = solids.filter((p) => targetIds.has(p.ownerId)),
    blockers = solids.filter((p) => !targetIds.has(p.ownerId) && p.box.occlusion);
  const norm = (p: Point3) => {
    const d = Math.hypot(p.x, p.y, p.z) || 1;
    return { x: p.x / d, y: p.y / d, z: p.z / d };
  };
  const f = norm(observer.forward),
    right = norm({ x: -f.z, y: 0, z: f.x }),
    up = { x: right.y * f.z - right.z * f.y, y: right.z * f.x - right.x * f.z, z: right.x * f.y - right.y * f.x };
  const tangent = Math.tan((observer.verticalFovDegrees * Math.PI) / 360),
    contributions: Record<string, number> = {};
  let projected = 0,
    visible = 0;
  for (let y = 0; y < observer.rows; y++)
    for (let x = 0; x < observer.columns; x++) {
      const u = (((x + 0.5) / observer.columns) * 2 - 1) * tangent * observer.aspect,
        v = (1 - ((y + 0.5) / observer.rows) * 2) * tangent;
      const d = norm({
        x: f.x + right.x * u + up.x * v,
        y: f.y + right.y * u + up.y * v,
        z: f.z + right.z * u + up.z * v
      });
      let hit = Infinity;
      for (const part of target) hit = Math.min(hit, rayBox(observer.position, d, part.box));
      if (!Number.isFinite(hit) || hit < observer.nearM) continue;
      projected++;
      let nearest = hit,
        owner = "";
      for (const part of blockers) {
        const t = rayBox(observer.position, d, part.box);
        if (t < nearest - 1e-4) {
          nearest = t;
          owner = part.ownerId;
        }
      }
      for (let t = observer.nearM; t < nearest - 0.05; t += observer.terrainStepM) {
        const p = { x: observer.position.x + d.x * t, z: observer.position.z + d.z * t };
        if (observer.position.y + d.y * t < ground(p) - 0.02) {
          owner = "terrain";
          break;
        }
      }
      if (owner) contributions[owner] = (contributions[owner] ?? 0) + 1;
      else visible++;
    }
  return {
    method: "viewport-ray-estimate" as const,
    projectedSamples: projected,
    visibleSamples: visible,
    screenFraction: visible / (observer.columns * observer.rows),
    occlusion: projected ? 1 - visible / projected : null,
    status: projected ? "sampled" : "no-projected-samples",
    blockers: contributions,
    resolution: [observer.columns, observer.rows]
  };
}
