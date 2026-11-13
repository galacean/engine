import { expect, it } from "vitest";
import { buildRock } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { simplifyRock, simplifierReady } from "@galacean/engine-terrain/rock-formation/generator/simplify-rock.js";
import { generateRuntimeRocks } from "@galacean/engine-terrain/rock-ridge/features/shaping/atomic-rocks.mjs";
import { fractureRockGeometry } from "@galacean/engine-terrain/rock-ridge/features/shaping/rock-surface.mjs";

await simplifierReady;
const library = generateRuntimeRocks({ buildRock, simplifyRock }, 487);
const point = (g: any, id: number) => g.positions.slice(id * 3, id * 3 + 3);

// Measure actual triangles and body/cut seams, independently of the wedge slope
// formula. All measurements use the source rock's normalized radial frame.
function dimensions(base: any, carved: any) {
  const f = carved.surface.normalizedFrame;
  const normalize = (p: number[]) => [
    (p[0] - f.center[0]) / f.radius[0],
    (p[1] - f.minimum) / f.height,
    (p[2] - f.center[1]) / f.radius[1]
  ];
  const vertices = (g: any) => Array.from({ length: g.positions.length / 3 }, (_, i) => normalize(point(g, i)));
  const original = vertices(base),
    result = vertices(carved);
  const edges = new Map<string, { a: number; b: number; tags: number[] }>();
  for (let i = 0; i < carved.indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = carved.indices[i + j],
        b = carved.indices[i + ((j + 1) % 3)];
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const e = edges.get(key) ?? { a, b, tags: [] };
      e.tags.push(carved.faceTags[i / 3]);
      edges.set(key, e);
    }
  const seams = [...edges.values()].filter((e) => e.tags.some((t) => t < 0) && e.tags.some((t) => t > 0));
  return carved.surface.fracturePaths.map((path: any) => {
    const section = path.sections[2],
      n = path.n,
      t = [-n[1], n[0]];
    const radial = (p: number[]) => p[0] * n[0] + p[2] * n[1];
    const tangent = (p: number[]) => p[0] * t[0] + p[2] * t[1];
    const surface = (positions: number[][], indices: number[]) => {
      let hit = -Infinity;
      for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3).map((id) => positions[id]);
        const ta = tangent(a),
          tb = tangent(b),
          tc = tangent(c);
        const d = (b[1] - c[1]) * (ta - tc) + (tc - tb) * (a[1] - c[1]);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((b[1] - c[1]) * (section.center - tc) + (tc - tb) * (section.y - c[1])) / d;
        const v = ((c[1] - a[1]) * (section.center - tc) + (ta - tc) * (section.y - c[1])) / d;
        if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9)
          hit = Math.max(hit, u * radial(a) + v * radial(b) + (1 - u - v) * radial(c));
      }
      return hit;
    };
    const crossings: number[] = [];
    for (const edge of seams) {
      const a = result[edge.a],
        b = result[edge.b];
      if (
        Math.abs(b[1] - a[1]) < 1e-12 ||
        section.y < Math.min(a[1], b[1]) - 1e-10 ||
        section.y > Math.max(a[1], b[1]) + 1e-10
      )
        continue;
      const u = (section.y - a[1]) / (b[1] - a[1]);
      const p = a.map((value, i) => value + u * (b[i] - value));
      if (radial(p) > 0.22) crossings.push(tangent(p) - section.center);
    }
    const left = Math.max(...crossings.filter((v) => v < 0)),
      right = Math.min(...crossings.filter((v) => v > 0));
    return { width: right - left, depth: surface(original, base.indices) - surface(result, carved.indices) };
  });
}

for (const role of ["peak", "cliff", "shoulder"]) {
  it(`${role}: depth moves inward without scaling the fracture mouth`, () => {
    const samples = [0.4, 1.3, 2].map((depth) =>
      dimensions(library[role], fractureRockGeometry(library[role], { depth, width: 0.8, irregularity: 1.8 }))
    );
    for (let joint = 0; joint < 5; joint++) {
      const cuts = samples.map((s) => s[joint]),
        widths = cuts.map((c) => c.width);
      expect(widths.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
      // Curved source faces allow some aperture drift; the previous fixed-angle
      // cutter instead enlarged its mouth about 5x for this 5x depth change.
      expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.25);
      expect(cuts[2].depth / cuts[0].depth).toBeCloseTo(5, 5);
      expect(cuts[1].depth / cuts[0].depth).toBeCloseTo(3.25, 5);
    }
  });

  it(`${role}: width opens the mouth without moving its inner tip`, () => {
    const samples = [0.4, 0.8, 1.6].map((width) =>
      dimensions(library[role], fractureRockGeometry(library[role], { depth: 1.3, width, irregularity: 1.8 }))
    );
    for (let joint = 0; joint < 5; joint++) {
      const cuts = samples.map((s) => s[joint]);
      expect(cuts[1].width).toBeGreaterThan(cuts[0].width * 1.5);
      expect(cuts[2].width).toBeGreaterThan(cuts[1].width * 1.5);
      expect(cuts[1].depth).toBeCloseTo(cuts[0].depth, 7);
      expect(cuts[2].depth).toBeCloseTo(cuts[0].depth, 7);
    }
  });
}

it("keeps apertures stable at the open preview's seed 425 / width 190% settings", () => {
  const source = generateRuntimeRocks({ buildRock, simplifyRock }, 425);
  for (const role of ["peak", "cliff", "shoulder"]) {
    const shallow = dimensions(
      source[role],
      fractureRockGeometry(source[role], { depth: 0.6, width: 1.9, irregularity: 0.8 })
    );
    const deep = dimensions(
      source[role],
      fractureRockGeometry(source[role], { depth: 2, width: 1.9, irregularity: 0.8 })
    );
    for (let joint = 0; joint < 5; joint++) {
      const a = shallow[joint],
        b = deep[joint];
      expect(Math.max(a.width, b.width) / Math.min(a.width, b.width)).toBeLessThan(1.2);
      expect(b.depth / a.depth).toBeCloseTo(2 / 0.6, 5);
    }
  }
});
