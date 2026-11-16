import { expect, it } from "vitest";
import { pointInPolygon, preparePointInPolygon } from "@galacean/engine-world-planning/geometry/V2Geometry";
import { overlap, preparePolygonOverlap } from "@galacean/engine-world-planning/semantic-study/WorldPlanningGeometry";
import { restrictPlanningFarmingCultivation } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";

// Independent original containment arithmetic, including its exact boundary threshold.
function reference(p: { x: number; z: number }, polygon: { x: number; z: number }[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j],
      dx = b.x - a.x,
      dz = b.z - a.z,
      l = dx * dx + dz * dz;
    const t = l > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l)) : 0;
    if (Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)) < 1e-7) return true;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const concave = [
  { x: 0, z: 0 },
  { x: 30, z: 0 },
  { x: 30, z: 30 },
  { x: 20, z: 30 },
  { x: 20, z: 10 },
  { x: 10, z: 10 },
  { x: 10, z: 30 },
  { x: 0, z: 30 }
];
it("preserves containment arithmetic at edges, row boundaries, tiny offsets and large coordinates", () => {
  for (const polygon of [
    concave,
    [...concave].reverse(),
    concave.map((p) => ({ x: p.x + 1e10, z: p.z + 1e10 })),
    [
      { x: -1e20, z: -1e20 },
      { x: 1e20, z: -1e20 },
      { x: 0, z: 1e20 }
    ],
    []
  ]) {
    const indexed = preparePointInPolygon(polygon);
    const probes = polygon.flatMap((p) =>
      [-1.00001e-7, -1e-7, -0.99999e-7, 0, 0.99999e-7, 1e-7, 1.00001e-7].flatMap((d) => [
        { x: p.x + d, z: p.z },
        { x: p.x, z: p.z + d }
      ])
    );
    for (let i = 0; i < 1000; i++)
      probes.push({ x: ((i * 0.61803398875) % 1) * 40 - 5, z: ((i * 0.41421356237) % 1) * 40 - 5 });
    for (const p of probes) {
      expect(pointInPolygon(p, polygon)).toBe(reference(p, polygon));
      expect(indexed(p)).toBe(reference(p, polygon));
    }
  }
});
it("matches full polygon overlap for concavity, touching boundaries and thousands of placement probes", () => {
  for (const polygon of [concave, [...concave].reverse(), concave.map((p) => ({ x: p.x + 3.31, z: p.z - 7.8 }))]) {
    const indexed = preparePolygonOverlap(polygon);
    for (let i = 0; i < 2000; i++) {
      const x = (i % 41) - 5,
        z = Math.floor(i / 41) - 5,
        w = i % 3 === 0 ? 1e-7 : 2.1;
      const probe = [
        { x, z },
        { x: x + w, z },
        { x: x + w, z: z + w },
        { x, z: z + w }
      ];
      expect(indexed(probe)).toBe(overlap(polygon, probe));
    }
  }
});
it("rebuilds reservation ownership for a new view and still reads current terrain and water facts", () => {
  let underwater = false,
    calls = 0;
  const raw: any = {
    inspectBounds: () => {
      calls++;
      return { blocked: false, underwater };
    }
  };
  const points = structuredClone(concave),
    view = restrictPlanningFarmingCultivation(raw, [points]);
  const b = { minimumX: 1, maximumX: 2, minimumZ: 1, maximumZ: 2 };
  expect(view.inspectBounds("ground", b).blocked).toBe(true);
  points.forEach((p) => (p.x += 100));
  underwater = true;
  expect(view.inspectBounds("ground", b)).toMatchObject({ blocked: true, underwater: true });
  expect(restrictPlanningFarmingCultivation(raw, [points]).inspectBounds("ground", b).blocked).toBe(false);
  expect(calls).toBe(3);
});
