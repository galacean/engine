import { add, basisPoint, clamp } from "./math";
import type { GuideProfile, ProfileGeometry, V3 } from "./types";

/** Build upwards in the OBB frame. Every point is inside the convex box, so
 * every source triangle is too. No continuation to the shared ground. */
export function ascendingBoundary(source: GuideProfile) {
  const box = source.obb,
    h = box.size[1],
    width = box.size[0],
    depth = box.size[2];
  const maximumOffset = Math.max(0, ...source.top.map((v) => v.heightOffset ?? 0)),
    upper: V3[] = [],
    lower: V3[] = [],
    starts: number[] = [],
    boundary: { x: number; z: number; runPerRise: number; offset: number }[] = [];
  const world = (p: V3): V3 => add(box.center, basisPoint(box.axes, p));
  const rises: number[] = [];
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < source.top.length; i++) {
    starts.push(boundary.length);
    const a = source.top[i],
      b = source.top[(i + 1) % source.top.length];
    for (const t of [0, ...source.faces[i].bottomSplits]) {
      const u = a.uv[0] + (b.uv[0] - a.uv[0]) * t,
        v = a.uv[1] + (b.uv[1] - a.uv[1]) * t;
      const x = (u * width) / 2,
        z = (v * depth) / 2,
        runPerRise =
          t === 0
            ? (1 / source.faces[i].descentRate +
                1 / source.faces[(i + source.faces.length - 1) % source.faces.length].descentRate) /
              2
            : 1 / source.faces[i].descentRate,
        offset = (a.heightOffset ?? 0) * (1 - t) + (b.heightOffset ?? 0) * t;
      boundary.push({ x, z, runPerRise, offset });
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  const fitScale = Math.min(box.size[0] / (maxX - minX), box.size[2] / (maxZ - minZ));
  if (!Number.isFinite(fitScale) || fitScale <= 0) throw Error(`${box.id}: ascent outline must have a finite extent`);
  // Translation is free: only the complete width/depth limits uniform scale.
  // At maximum scale a pair of opposite plane edges is reached. Choose the
  // smallest required translation when the other axis has placement freedom.
  const shiftX = clamp(0, -box.size[0] / 2 - minX * fitScale, box.size[0] / 2 - maxX * fitScale),
    shiftZ = clamp(0, -box.size[2] / 2 - minZ * fitScale, box.size[2] / 2 - maxZ * fitScale);
  for (const point of boundary) {
    const x = point.x * fitScale,
      z = point.z * fitScale,
      radius = Math.hypot(x, z),
      runPerRise = point.runPerRise,
      requestedRise = Math.max(0, h + (point.offset - maximumOffset) * box.axes[1][1]),
      // Stop before rays collapse at the centre; shallow rates make lower peaks.
      rise = Math.min(requestedRise, (radius * 0.94) / runPerRise),
      scale = radius > 0 ? 1 - (rise * runPerRise) / radius : 0;
    rises.push(rise);
    lower.push(world([shiftX + x, -h / 2, shiftZ + z]));
    upper.push(world([shiftX + x * scale, -h / 2 + rise, shiftZ + z * scale]));
  }
  // Move the original star-shaped contraction anchor with the fitted outline.
  const center = world([shiftX, -h / 2 + rises.reduce((sum, value) => sum + value, 0) / rises.length, shiftZ]);
  const triangles: [V3, V3, V3][] = [];
  for (let i = 0; i < upper.length; i++) {
    const j = (i + 1) % upper.length;
    triangles.push([center, upper[i], upper[j]], [upper[i], lower[i], lower[j]], [upper[i], lower[j], upper[j]]);
  }
  const geometry: ProfileGeometry = {
    id: box.id,
    top: starts.map((i) => upper[i]),
    upperBoundary: upper,
    capCenter: center,
    bottom: lower,
    bottomByFace: starts.map((start, i) => {
      const end = starts[i + 1] ?? lower.length;
      return [...lower.slice(start, end), lower[end % lower.length]];
    }),
    ground: lower.map((p) => [p[0], p[2]]),
    struts: upper.map((p, i) => [p, lower[i]])
  };
  return { geometry, triangles };
}
