import { expect, it } from "vitest";
import { compileWaterShape, validateWaterShape, type WaterShapeAuthoring } from "../src/water/native/WaterAuthoring";
import { createWaterRepresentationInstanceStateV1 } from "../src/water/authoring/body/WaterBodyInstance";
import { createWaterQualitySettings } from "../src/water/native/WaterQualitySettings";
const shape: Extract<WaterShapeAuthoring, { kind: "ocean" }> = {
  kind: "ocean",
  waterLevel: 0,
  layout: {
    schemaVersion: 1,
    kind: "ocean-surface-layout",
    centerXZ: [4, 4],
    size: 8,
    surfaceTopology: "finite",
    finitePatchGridSize: 16
  }
};
const terrain = {
  id: "bed",
  revision: 1,
  origin: [0, 0] as const,
  spacing: 1,
  columns: 9,
  rows: 9,
  heights: Array.from({ length: 81 }, (_, i) => {
    const x = i % 9,
      z = Math.floor(i / 9);
    return x >= 2 && x <= 6 && z >= 2 && z <= 6 ? (x === 4 && z === 4 ? -2 : 1) : -3;
  })
};
const desc = (s: typeof shape) =>
  (compileWaterShape(s, terrain, "ocean").source as any).descriptor.config.nearshoreDescriptor;

it("rejects unsupported Ocean layouts at both authoring and instance boundaries", () => {
  const layout = { ...shape.layout, surfaceTopology: "fixed-lod" } as unknown as typeof shape.layout;
  expect(() => validateWaterShape({ ...shape, layout })).toThrow("surfaceTopology must be 'finite'");
  expect(() => createWaterRepresentationInstanceStateV1(layout)).toThrow("surfaceTopology must be 'finite'");
  expect(createWaterRepresentationInstanceStateV1(shape.layout)).toEqual(shape.layout);
  const { finitePatchGridSize: _grid, ...missingGrid } = shape.layout;
  expect(() => createWaterRepresentationInstanceStateV1(missingGrid as typeof shape.layout)).toThrow(
    "finitePatchGridSize is required"
  );
});

it.each(["fixedLodRingPatchSegments", "fixedLodCentralPatchSegments", "fixedLodFirstRingPatchSegments"])(
  "rejects removed Ocean quality budget %s before runtime preparation",
  (field) => {
    expect(() => createWaterQualitySettings("ocean", { backendBudgets: { ocean: { [field]: 16 } } })).toThrow(
      `Unknown Water Quality property 'quality.backendBudgets.ocean.${field}'`
    );
    expect(
      createWaterQualitySettings("ocean", { backendBudgets: { ocean: { finitePatchSegments: 16 } } }).backendBudgets
        ?.ocean?.finitePatchSegments
    ).toBe(16);
  }
);
it("preserves legacy water-level behavior and real beds", () => {
  expect(desc(shape).wetSource.kind).toBe("water-level");
  const result = desc({ ...shape, boundaryConnected: true });
  expect(result.wetSource.mask[40]).toBe(0);
  expect(result.wetSource.mask[0]).toBe(1);
  expect(Array.from(result.bedHeights)).toEqual(terrain.heights);
});
it("excludes polygons even when the bed is connected and validates fields", () => {
  const excludedAreas = [
    [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 0, z: 1 }
    ]
  ];
  const result = desc({ ...shape, excludedAreas });
  expect(result.wetSource.mask[0]).toBe(0);
  expect(result.wetSource.mask[2]).toBe(1);
  expect(() => validateWaterShape({ ...shape, excludedAreas: [[{ x: 0, z: 0 }]] })).toThrow();
  expect(() => validateWaterShape({ ...shape, boundaryConnected: "yes" as any })).toThrow();
  expect(compileWaterShape({ ...shape, excludedAreas }, terrain, "ocean").sourceHash).not.toBe(
    compileWaterShape(shape, terrain, "ocean").sourceHash
  );
});

it("uses accepted refined beds for native Ocean connection facts", async () => {
  const { waterConnectionFacts } = await import("../src/water/native/WaterConnectionAuthoring");
  const patch = {
    id: "mouth",
    revision: 1,
    origin: [2, 2] as const,
    spacing: 1,
    columns: 3,
    rows: 3,
    surface: "float32-triangles" as const,
    heights: Array(9).fill(-2)
  };
  const accepted = { ...terrain, refinements: [patch] };
  const asset = compileWaterShape({ ...shape, boundaryConnected: true }, accepted, "ocean");
  expect(waterConnectionFacts("ocean", shape, asset, accepted).terrain).toBe(accepted);
});
it("accepts positive sub-metre resolved native river widths", () => {
  const bed = { ...terrain, heights: Array(81).fill(-1) };
  const river: WaterShapeAuthoring = {
    kind: "river",
    speed: 1,
    course: {
      id: "narrow",
      points: [
        { id: "a", x: 2, z: 4, elevation: 0, width: 0.5, depth: 1 },
        { id: "b", x: 6, z: 4, elevation: 0, width: 0.5, depth: 1 }
      ]
    }
  };
  expect(() => compileWaterShape(river, bed, "narrow")).not.toThrow();
});

it("preserves nested wetSource.mask typed array without duplicating it across effective descriptor cache", async () => {
  const { createEffectiveOceanWaterBodyDescriptor } = await import("../src/water/runtime/ocean/OceanWaterCompiledResource");
  const compiled = compileWaterShape({ ...shape, boundaryConnected: true }, terrain, "ocean");
  const raw = (compiled.source as any).descriptor;
  const effective = createEffectiveOceanWaterBodyDescriptor(raw);
  expect(effective.config.nearshoreDescriptor).not.toBe(raw.config.nearshoreDescriptor);
  expect(effective.config.nearshoreDescriptor.bedHeights).toBe(raw.config.nearshoreDescriptor.bedHeights);
  expect(effective.config.nearshoreDescriptor.wetSource).not.toBe(raw.config.nearshoreDescriptor.wetSource);
  expect(effective.config.nearshoreDescriptor.wetSource.mask).toBe(raw.config.nearshoreDescriptor.wetSource.mask);
});
