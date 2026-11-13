import fixture from "./fixtures/terrain-hydrology-lake.json";
import { createLakeSpatialFieldBudget } from "../src/water/presets/lake/LakeWaterLook";
import type { WaterShapeAuthoring } from "../src/water/native/WaterAuthoring";
import type { WaterTerrainSnapshot } from "../src/water/authoring/terrain/WaterTerrainSnapshot";
import type { HeightfieldWaterDescriptorV1 } from "../src/water/authoring/heightfield/HeightfieldWaterDescriptor";

import { expect, it } from "vitest";
import { compileWaterShape } from "../src/water/native/WaterAuthoring";
import { HeightfieldWaterCompiler } from "../src/water/compiler/heightfield/HeightfieldWaterCompiler";
import { WaterQualityTier } from "../src/water/authoring/wave/enums/WaterQualityTier";

it.each([false, true])(
  "excludes distant pits but preserves shoreline filtering support (near shore: %s)",
  (nearShore) => {
    const terrain = {
      id: "lake-and-neighbour-pit",
      revision: 1,
      origin: [-16, -16] as const,
      spacing: 1,
      columns: 33,
      rows: 33,
      surface: "float32-triangles" as const,
      heights: Array.from({ length: 1089 }, (_, i) => (i % 33 >= (nearShore ? 21 : 26) ? -100 : -2))
    };
    const asset = compileWaterShape(
      {
        kind: "lake",
        referenceLevel: 0,
        levelOffsetM: 0,
        shoreline: [
          [-4, -4],
          [4, -4],
          [4, 4],
          [-4, 4]
        ].map(([x, z], i) => ({ id: String(i), ring: "shore", x, z }))
      },
      terrain,
      "lake"
    );
    const source = asset.source as any,
      representation = asset.representationData as any;
    const compiled = HeightfieldWaterCompiler.compile({
      ...source.descriptor,
      ...representation,
      schemaVersion: source.descriptor.schemaVersion,
      quality: WaterQualityTier.High
    });
    expect(compiled.valid, JSON.stringify(compiled.diagnostics)).toBe(true);
    expect(compiled.data!.localMapAtlas.maxDepth).toBe(nearShore ? 100 : 2);
  }
);

it("reports the real generated Lake precision and accepts the existing data-derived budget", () => {
  const asset = compileWaterShape(
    fixture.shape as WaterShapeAuthoring,
    fixture.bed as unknown as WaterTerrainSnapshot,
    fixture.id
  );
  const source = asset.source as any,
    representation = asset.representationData as any;
  const descriptor = {
    ...source.descriptor,
    spatialField: representation.spatialField,
    renderSurface: representation.renderSurface,
    quality: WaterQualityTier.High
  } as HeightfieldWaterDescriptorV1;
  const compiled = HeightfieldWaterCompiler.compile(descriptor);
  expect(compiled.valid, JSON.stringify(compiled.diagnostics)).toBe(true);
  const error = compiled.data!.localMapAtlas.maxDepth / 510;
  expect(error).toBeGreaterThan(0.02);
  const budget = createLakeSpatialFieldBudget(descriptor);
  expect(error).toBeLessThanOrEqual(budget.maximumGpuDepthDecodeError);
  console.log(
    JSON.stringify({
      actualMaximumDepth: compiled.data!.localMapAtlas.maxDepth,
      gpuDepthError: error,
      derivedBudget: budget
    })
  );
});
