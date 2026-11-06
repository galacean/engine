import { firstRingCrossing, ringArea } from "./WorldPlanningGeometry";
import type { PlanPoint, PlanRoute } from "./IslandPlanModel";
/** Smooth two-bank ribbon from ordered cross-sections. Width changes are interpolated along the path, not joined as constant-width rectangles. */
export function ribbonOutline(
  points: PlanPoint[],
  widths: number[],
  caps?: PlanRoute["caps"],
  sampled = false,
  closed = false
): PlanPoint[] {
  if (points.length < 2) return [];
  const samples: { p: PlanPoint; w: number }[] = [];
  if (sampled) samples.push(...points.map((p, i) => ({ p, w: widths[i] ?? widths.at(-1)! })));
  else {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)],
        b = points[i],
        c = points[i + 1],
        d = points[Math.min(points.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / 10));
      const w0 = i ? ((widths[i - 1] ?? widths[0]) + (widths[i] ?? widths.at(-1)!)) / 2 : widths[0];
      const w1 =
        i === points.length - 2
          ? widths.at(-1)!
          : ((widths[i] ?? widths.at(-1)!) + (widths[i + 1] ?? widths.at(-1)!)) / 2;
      for (let j = 0; j < n; j++) {
        const t = j / n,
          u = t * t * (3 - 2 * t);
        const coord = (key: "x" | "z") =>
          0.5 *
          (2 * b[key] +
            (-a[key] + c[key]) * t +
            (2 * a[key] - 5 * b[key] + 4 * c[key] - d[key]) * t * t +
            (-a[key] + 3 * b[key] - 3 * c[key] + d[key]) * t * t * t);
        samples.push({ p: { x: coord("x"), z: coord("z") }, w: w0 + (w1 - w0) * u });
      }
    }
    samples.push({ p: points.at(-1)!, w: widths.at(-1)! });
  }
  const left: PlanPoint[] = [],
    right: PlanPoint[] = [];
  for (let i = 0; i < samples.length; i++) {
    const a = samples[closed && (i === 0 || i === samples.length - 1) ? samples.length - 2 : Math.max(0, i - 1)].p,
      b = samples[closed && (i === 0 || i === samples.length - 1) ? 1 : Math.min(samples.length - 1, i + 1)].p,
      p = samples[i].p,
      len = Math.hypot(b.x - a.x, b.z - a.z) || 1,
      w = samples[i].w / 2,
      nx = -(b.z - a.z) / len,
      nz = (b.x - a.x) / len;
    left.push({ x: p.x + nx * w, z: p.z + nz * w });
    right.push({ x: p.x - nx * w, z: p.z - nz * w });
  }
  const cap = (at: PlanPoint, toward: PlanPoint, w: number, start: number) => {
    const angle = Math.atan2(at.z - toward.z, at.x - toward.x);
    return Array.from({ length: 7 }, (_, i) => ({
      x: at.x + (Math.cos(angle + start - ((i + 1) * Math.PI) / 8) * w) / 2,
      z: at.z + (Math.sin(angle + start - ((i + 1) * Math.PI) / 8) * w) / 2
    }));
  };
  return trimOffsetLoops([
    ...left,
    ...(closed || caps?.end === "butt" ? [] : cap(points.at(-1)!, points.at(-2)!, widths.at(-1)!, Math.PI / 2)),
    ...right.reverse(),
    ...(closed || caps?.start === "butt" ? [] : cap(points[0], points[1], widths[0], Math.PI / 2))
  ]);
}

// A wide offset on the inside of a tight bend can fold over itself. Cut the
// folded loop at its exact intersection, retaining the outer occupied region.
function trimOffsetLoops(input: PlanPoint[]): PlanPoint[] {
  let ring = input;
  for (let round = 0; round < 32; round++) {
    const crossing = firstRingCrossing(ring);
    if (!crossing) break;
    const [i, j] = crossing;
    const a = ring[i],
      b = ring[(i + 1) % ring.length],
      c = ring[j],
      d = ring[(j + 1) % ring.length];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      ex = d.x - c.x,
      ez = d.z - c.z,
      t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / (dx * ez - dz * ex),
      point = { x: a.x + t * dx, z: a.z + t * dz };
    const loop = [point, ...ring.slice(i + 1, j + 1)],
      outer = [...ring.slice(0, i + 1), point, ...ring.slice(j + 1)];
    ring = ringArea(outer) >= ringArea(loop) ? outer : loop;
  }
  return ring;
}
