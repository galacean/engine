import { expect, it } from "vitest";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock, simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { generateRuntimeRocks } from "@galacean/engine-terrain/rock-ridge/features/shaping/atomic-rocks.mjs";
import {
  fractureRockGeometry,
  creasedRockAttributes
} from "@galacean/engine-terrain/rock-ridge/features/shaping/rock-surface.mjs";
import { reduceMountainRock } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/MountainRockReduction";

await simplifierReady;
const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const point = (g: any, id: number) => g.positions.slice(id * 3, id * 3 + 3);
function volume(g: any) {
  let v = 0;
  for (let i = 0; i < g.indices.length; i += 3) {
    const [a, b, c] = g.indices.slice(i, i + 3).map((id: number) => point(g, id));
    v += dot(a, cross(b, c)) / 6;
  }
  return v;
}
function closed(g: any) {
  const edges = new Map<string, { count: number; winding: number }>();
  for (let i = 0; i < g.indices.length; i += 3) {
    const ids = g.indices.slice(i, i + 3),
      [a, b, c] = ids.map((id: number) => point(g, id).map(Math.fround));
    expect(Math.hypot(...cross(sub(b, a), sub(c, a)))).toBeGreaterThan(0);
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const e = edges.get(key) ?? { count: 0, winding: 0 };
      e.count++;
      e.winding += a < b ? 1 : -1;
      edges.set(key, e);
    }
  }
  expect([...edges.values()].every((e) => e.count === 2 && e.winding === 0)).toBe(true);
  expect(g.positions.length / 3 - edges.size + g.indices.length / 3).toBe(2);
}
const controls = { depth: 1.3, width: 1.6, irregularity: 1.8 };

it("retains rounded source mass while cutting local vertical joints, including after native reduction", () => {
  for (const seed of [1, 425]) {
    const library = generateRuntimeRocks({ buildRock, simplifyRock }, seed);
    for (const role of ["peak", "shoulder", "cliff"]) {
      const base = library[role],
        before = JSON.stringify(base),
        carved = fractureRockGeometry(base, controls);
      expect(carved.surface.planes).toBe(0); // no whole-body planar hull cuts
      expect(volume(carved) / volume(base)).toBeGreaterThan(0.88);
      expect(volume(carved)).toBeLessThan(volume(base) * 0.995);
      closed(carved);
      const reduced = reduceMountainRock(carved, 1000);
      closed(reduced);
      const render = creasedRockAttributes(reduced),
        planes = new Map(carved.surface.cutPlanes.map((p: any) => [p.tag, p]));
      let smoothBodyCorners = 0,
        cutCorners = 0;
      for (let i = 0; i < reduced.indices.length; i += 3) {
        const [a, b, c] = reduced.indices.slice(i, i + 3).map((id: number) => point(reduced, id));
        const normal = cross(sub(b, a), sub(c, a)),
          length = Math.hypot(...normal);
        const plane = planes.get(reduced.faceTags[i / 3]) as any;
        if (plane) {
          expect(plane.kind).toBe("joint");
          expect(plane.role).toBe("wall");
          const f = carved.surface.normalizedFrame;
          for (const p of [a, b, c]) {
            const q = [
              (p[0] - f.center[0]) / f.radius[0],
              (p[1] - f.minimum) / f.height,
              (p[2] - f.center[1]) / f.radius[1]
            ];
            expect(Math.abs(dot(q, plane.n) - plane.w)).toBeLessThan(1e-7);
          }
        }
        for (let k = 0; k < 3; k++) {
          const n = render.normals.slice((i + k) * 3, (i + k) * 3 + 3),
            agreement = dot(n, normal) / length;
          if (plane) {
            expect(agreement).toBeCloseTo(1, 5);
            cutCorners++;
          } else if (agreement < 0.9999) smoothBodyCorners++;
        }
      }
      expect(cutCorners).toBeGreaterThan(30);
      expect(smoothBodyCorners).toBeGreaterThan(reduced.indices.length * 0.25);
      // Compare support in 216 view directions: a local notch may interrupt a
      // contour, but carving must not replace the source silhouette with a prism.
      for (let j = 0; j < 72; j++)
        for (const e of [-0.8, 0, 0.8]) {
          const a = (j * Math.PI) / 36,
            n = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)];
          const support = (g: any) => {
            let lo = Infinity,
              hi = -Infinity;
            for (let i = 0; i < g.positions.length; i += 3) {
              const v = dot(g.positions.slice(i, i + 3), n);
              lo = Math.min(lo, v);
              hi = Math.max(hi, v);
            }
            return [lo, hi];
          };
          const b = support(base),
            r = support(reduced),
            span = b[1] - b[0];
          expect(Math.max(r[0] - b[0], b[1] - r[1]) / span).toBeLessThan(0.06);
        }
      expect(JSON.stringify(base)).toBe(before);
    }
  }
}, 60000);

it("zero fracture depth or width leaves the exact atomic geometry intact", () => {
  const base = generateRuntimeRocks({ buildRock, simplifyRock }, 425).peak;
  for (const options of [
    { ...controls, depth: 0 },
    { ...controls, width: 0 }
  ]) {
    const g = fractureRockGeometry(base, options);
    expect(g.positions).toEqual(base.positions);
    expect(g.indices).toEqual(base.indices);
    expect(g.surface.cutPlanes).toHaveLength(0);
  }
});
