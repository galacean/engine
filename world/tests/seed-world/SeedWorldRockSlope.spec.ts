import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { seedAscentProfile } from "@galacean/engine-terrain/rock-formation/AscentMask";
import { ascendingBoundary } from "@galacean/engine-terrain/rock-formation/AscendingBoundary";
import { decodeCellularModule, type CellularModule } from "@galacean/engine-terrain/rock-formation/CellularModule";
import {
  formationHeightfield,
  generateRockFormation
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Generate";
import { rockFormationDomain } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Jobs";
import { automaticSlopeRate, rockFaceSlopeRate } from "@galacean/engine-terrain/rock-formation/Slope";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import type { RockFormationJob, RockObb } from "@galacean/engine-terrain/rock-formation/types";
import { importPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";

const guide = (): RockObb => ({
  id: "slope-a",
  ownerId: "rock:obb:a",
  center: [0, 18, 0],
  size: [48, 36, 40],
  axes: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ]
});
const rates = (obb: RockObb) => seedAscentProfile(obb, 17).faces.map((face) => face.descentRate);
const settings = readRockFormationSettings(
  importPlanningDocument({ version: 2, parameters: { ...SEMANTIC_DEFAULTS }, edits: {} })
);
const job = (): RockFormationJob => ({
  id: "slope-rock",
  seed: 17,
  origin: [0, 0, 0],
  guides: [guide()],
  domain: rockFormationDomain([guide()]),
  ground: { minX: -50, minZ: -50, spacingX: 100, spacingZ: 100, columns: 2, rows: 2, heights: new Float32Array(4) }
});
let module: CellularModule;
beforeAll(() => {
  const bytes = readFileSync(
    new URL("../../../packages/terrain/src/rock-formation/assets/asymmetric.glb", import.meta.url)
  );
  module = decodeCellularModule(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});

it("derives the automatic rise/run from height and the shorter footprint half-span", () => {
  expect(automaticSlopeRate([48, 36, 40])).toBe(1.8);
  expect(automaticSlopeRate([40, 36, 48])).toBe(1.8);
  expect(automaticSlopeRate([480, 360, 400])).toBe(1.8);
  const obb = { ...guide(), slopeVariation: 0 };
  expect(rates(obb).every((rate) => rate === 1.8)).toBe(true);
  expect(rates({ ...obb, size: [48, 72, 40] }).every((rate) => rate === 3.6)).toBe(true);
  expect(rates({ ...obb, size: [24, 36, 20] }).every((rate) => rate === 3.6)).toBe(true);
  expect(rates({ ...obb, center: [200, 500, -100] })).toEqual(rates(obb));
});

it("defaults to size-derived slopes with 20% variation and preserves random streams across edits", () => {
  const obb = guide(),
    baseline = seedAscentProfile(obb, 17);
  expect(seedAscentProfile({ ...obb, slopeMode: "auto", slopeVariation: 0.2 }, 17)).toMatchObject(baseline);
  const flat = seedAscentProfile({ ...obb, slopeVariation: 0 }, 17);
  const manual = seedAscentProfile({ ...obb, slopeMode: "manual", slopeRate: 1.55, slopeVariation: 0.05 }, 17);
  for (const changed of [flat, manual]) {
    expect(changed.top).toEqual(baseline.top);
    expect(changed.faces.map((face) => face.bottomSplits)).toEqual(baseline.faces.map((face) => face.bottomSplits));
    expect(changed.faces.map((face) => face.descentRate)).not.toEqual(rates(obb));
  }
  expect(manual.faces.every((face) => face.descentRate >= 1.55 * 0.95 && face.descentRate <= 1.55 * 1.05)).toBe(true);
  expect(seedAscentProfile({ ...obb, slopeVariation: 0.2 }, 17)).toMatchObject(baseline);
  expect(rates({ ...obb, size: [480, 360, 400] })).toEqual(rates(obb));
  expect(rates({ ...obb, slopeMode: "auto", slopeRate: 30 })).toEqual(rates(obb));
});

it("keeps manual slope independent of OBB ratio and accepts positive rates beyond lab UI limits", () => {
  const obb = { ...guide(), slopeMode: "manual" as const, slopeRate: 20, slopeVariation: 0 };
  expect(rates(obb).every((rate) => rate === 20)).toBe(true);
  expect(rates({ ...obb, size: [48, 72, 40] })).toEqual(rates(obb));
  expect(rates({ ...guide(), slopeMode: "manual", slopeVariation: 0 })).toEqual(
    rates({ ...guide(), slopeVariation: 0 })
  );
  expect(rockFaceSlopeRate({ ...obb, slopeVariation: 1 }, 17)(1)).toBe(40);
  for (const slopeRate of [0.001, 1.55, 20, 1000]) {
    const profile = seedAscentProfile({ ...obb, slopeRate, slopeVariation: 0.8 }, 17);
    for (const triangle of ascendingBoundary(profile).triangles)
      for (const point of triangle)
        for (let axis = 0; axis < 3; axis++)
          expect(Math.abs(point[axis] - obb.center[axis])).toBeLessThanOrEqual(obb.size[axis] / 2 + 1e-8);
  }
});

it("defaults upper-height offsets to zero and scales their seeded amplitude without rerolling outlines or slopes", () => {
  const obb = guide(),
    baseline = seedAscentProfile(obb, 17);
  expect(baseline.top.every((vertex) => vertex.heightOffset === 0)).toBe(true);
  const varied = seedAscentProfile({ ...obb, heightVariation: 0.2 }, 17);
  const doubled = seedAscentProfile({ ...obb, heightVariation: 0.4 }, 17);
  expect(varied.top.some((vertex) => Math.abs(vertex.heightOffset!) > 0)).toBe(true);
  expect(varied.faces).toEqual(baseline.faces);
  expect(varied.top.map(({ id, uv }) => ({ id, uv }))).toEqual(baseline.top.map(({ id, uv }) => ({ id, uv })));
  for (let i = 0; i < varied.top.length; i++) {
    expect(Math.abs(varied.top[i].heightOffset!)).toBeLessThanOrEqual(obb.size[1] * 0.2);
    expect(doubled.top[i].heightOffset).toBeCloseTo(2 * varied.top[i].heightOffset!, 12);
  }
  expect(seedAscentProfile({ ...obb, heightVariation: 0.2 }, 17)).toEqual(varied);
  expect(seedAscentProfile({ ...obb, heightVariation: 0 }, 17).top).toEqual(baseline.top);
  for (const heightVariation of [-0.01, 1.01, NaN, Infinity])
    expect(() => seedAscentProfile({ ...obb, heightVariation }, 17)).toThrow("upper height variation");
});

it.each(["random-ascent", "perlin-ascent"] as const)(
  "applies upper-height variation only to the edited %s OBB",
  (heightMode) => {
    const input = job();
    Object.assign(input.guides[0], { heightMode, slopeMode: "manual", slopeRate: 3 });
    input.guides.push({ ...structuredClone(input.guides[0]), id: "height-b", ownerId: "rock:obb:b" });
    const before = formationHeightfield(input, settings);
    input.guides[0].heightVariation = 0.2;
    const changed = formationHeightfield(input, settings);
    expect(changed.masks[0]).not.toEqual(before.masks[0]);
    expect(changed.contributions[0]).not.toEqual(before.contributions[0]);
    expect(changed.masks[1]).toEqual(before.masks[1]);
    expect(changed.contributions[1]).toEqual(before.contributions[1]);
    expect(formationHeightfield(input, settings)).toEqual(changed);
    input.guides[0].heightVariation = 0;
    expect(formationHeightfield(input, settings)).toEqual(before);
  }
);

it.each(["random-ascent", "perlin-ascent"] as const)("changes only the edited OBB's %s contribution", (heightMode) => {
  const input = job();
  input.guides[0].heightMode = heightMode;
  input.guides.push({ ...guide(), id: "slope-b", ownerId: "rock:obb:b", center: [8, 18, 0], heightMode });
  const before = formationHeightfield(input, settings);
  Object.assign(input.guides[0], { slopeMode: "manual", slopeRate: 0.4, slopeVariation: 0 });
  const changed = formationHeightfield(input, settings);
  expect(changed.masks[0]).not.toEqual(before.masks[0]);
  expect(changed.contributions[0]).not.toEqual(before.contributions[0]);
  expect(changed.masks[1]).toEqual(before.masks[1]);
  expect(changed.contributions[1]).toEqual(before.contributions[1]);
  expect(changed.peaks[0]).toBeLessThan(before.peaks[0]);
  expect(formationHeightfield(input, settings)).toEqual(changed);
});

for (const heightMode of ["random-ascent", "perlin-ascent"] as const)
  it.each(["vertex-slabs", "cellular-curvature"] as const)(
    `publishes slope changes through ${heightMode} and %s`,
    (surfaceMode) => {
      const input = job();
      Object.assign(input.guides[0], { heightMode, surfaceMode });
      const before = generateRockFormation(input, settings, module);
      Object.assign(input.guides[0], { slopeMode: "manual", slopeRate: 0.4, slopeVariation: 0 });
      const changed = generateRockFormation(input, settings, module);
      expect(changed.mesh.positions).not.toEqual(before.mesh.positions);
      expect(changed.mesh.positions.every(Number.isFinite)).toBe(true);
      expect(changed.mesh.normals!.every(Number.isFinite)).toBe(true);
      expect(changed.owners).toHaveLength(changed.mesh.indices.length / 3);
      expect(new Set(changed.owners)).toEqual(new Set([input.guides[0].ownerId]));
      expect(generateRockFormation(input, settings, module).mesh).toEqual(changed.mesh);
    }
  );

it("rejects invalid slope settings at the generation boundary", () => {
  for (const slopeRate of [0, -1, NaN, Infinity])
    expect(() => seedAscentProfile({ ...guide(), slopeRate }, 17)).toThrow("Manual slope rate");
  for (const slopeVariation of [-0.1, 1.1, NaN, Infinity])
    expect(() => seedAscentProfile({ ...guide(), slopeVariation }, 17)).toThrow("Slope variation");
  expect(() => seedAscentProfile({ ...guide(), slopeMode: "invalid" as never }, 17)).toThrow("slope mode");
});
