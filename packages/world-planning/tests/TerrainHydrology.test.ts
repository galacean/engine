import { readFileSync } from "node:fs";
import editorLand from "./fixtures/editor-seed42-land.json";
import { describe, it, expect } from "vitest";
import { generateTerrainHydrology, type TerrainHydrologyInput } from "../src/generation/terrain/TerrainHydrology";
import { compileWaterShape } from "@galacean/engine-water/water/native/WaterAuthoring";
import { sampleWaterTerrainHeight } from "@galacean/engine-water/water/authoring/terrain/WaterTerrainSnapshot";

const input: TerrainHydrologyInput = {
  seed: 42,
  width: 256,
  depth: 256,
  landPolygons: [
    [
      { x: 0, z: 0 },
      { x: 256, z: 0 },
      { x: 256, z: 256 },
      { x: 0, z: 256 }
    ]
  ],
  heightAt: () => 12
};
describe("External terrain hydrology", () => {
  it("preserves external heights when water is omitted, and validates ranges", () => {
    const result = generateTerrainHydrology({ ...input, heightAt: (x, z) => -3 + x * 0.01 + z * 0.02 });
    expect(result.heightAt(20, 30)).toBeCloseTo(-2.2);
    expect(result.rivers).toHaveLength(0);
    expect(result.lakes).toHaveLength(0);
    expect(() => generateTerrainHydrology({ ...input, rivers: { countMin: 2, countMax: 1 } })).toThrow();
  });
  it("reuses seeded geometry and carves only below the supplied surface", () => {
    const options = { ...input, rivers: { countMin: 2, countMax: 2 }, lakes: { countMin: 1, countMax: 1 } };
    const a = generateTerrainHydrology(options),
      b = generateTerrainHydrology(options);
    expect(a.rivers).toEqual(b.rivers);
    expect(a.lakes).toEqual(b.lakes);
    expect(a.rivers.length).toBeGreaterThan(0);
    expect(a.lakes).toHaveLength(1);
    for (let z = 0; z <= 256; z += 4)
      for (let x = 0; x <= 256; x += 4) expect(a.heightAt(x, z)).toBeLessThanOrEqual(12);
  });
  it("supports negative lake datums and reports no natural basin on flat terrain", () => {
    const a = generateTerrainHydrology({ ...input, heightAt: () => -3, lakes: { countMin: 1, countMax: 1 } });
    expect(a.lakes).toHaveLength(1);
    expect(a.lakes[0].referenceLevel).toBeLessThan(-3);
    const b = generateTerrainHydrology({ ...input, lakes: { countMin: 1, countMax: 1, allowCarving: false } });
    expect(b.lakes).toHaveLength(0);
    expect(b.diagnostics.length).toBeGreaterThan(0);
  });
  it("compiles generated native shapes using final RG16 decoded local beds", () => {
    const result = generateTerrainHydrology({
      ...input,
      rivers: { countMin: 1, countMax: 1 },
      lakes: { countMin: 1, countMax: 1 }
    });
    for (const body of [...result.rivers, ...result.lakes]) {
      const points = "points" in body ? body.outline : body.shoreline;
      const x0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p.x))) - 16),
        z0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p.z))) - 16);
      const x1 = Math.min(256, Math.ceil(Math.max(...points.map((p) => p.x))) + 16),
        z1 = Math.min(256, Math.ceil(Math.max(...points.map((p) => p.z))) + 16);
      const columns = x1 - x0 + 1,
        rows = z1 - z0 + 1;
      const terrain = {
        id: body.id,
        revision: 1,
        origin: [x0, z0] as const,
        spacing: 1,
        columns,
        rows,
        heights: Array.from(
          { length: columns * rows },
          (_, i) =>
            (Math.round((result.heightAt(x0 + (i % columns), z0 + Math.floor(i / columns)) / 32) * 65535) / 65535) * 32
        )
      };
      const shape =
        "points" in body
          ? {
              kind: "river" as const,
              speed: body.speed,
              course: {
                id: body.id,
                points: body.points.map((p) => ({
                  ...p,
                  depth: p.elevation - sampleWaterTerrainHeight(terrain, p.x, p.z)!
                }))
              }
            }
          : {
              kind: "lake" as const,
              shoreline: body.shoreline,
              referenceLevel: body.referenceLevel,
              levelOffsetM: body.levelOffsetM,
              basin: { depthM: body.depthM, bankWidthM: body.bankWidthM, carve: false }
            };
      expect(() => compileWaterShape(shape, terrain, body.id)).not.toThrow();
    }
  });
});

it("extends real mouths and passes native connections against the same RG16 bed", async () => {
  const { compileWaterConnectionGraph } = await import("@galacean/engine-water/water/native/WaterConnectionAuthoring");
  const island = {
    ...input,
    width: 256,
    depth: 256,
    landPolygons: [
      [
        { x: 32, z: 32 },
        { x: 224, z: 32 },
        { x: 224, z: 224 },
        { x: 32, z: 224 }
      ]
    ],
    heightAt: (x: number, z: number) => Math.min(x - 32, 224 - x, z - 32, 224 - z) * 0.12,
    ocean: true,
    rivers: { countMin: 2, countMax: 2 }
  };
  const result = generateTerrainHydrology(island);
  expect(result.rivers).toHaveLength(2);
  const terrain = {
    id: "accepted",
    revision: 1,
    origin: [0, 0] as const,
    spacing: 1,
    columns: 257,
    rows: 257,
    heights: Array.from(
      { length: 257 * 257 },
      (_, i) => (Math.round(((result.heightAt(i % 257, Math.floor(i / 257)) + 32) / 64) * 65535) / 65535) * 64 - 32
    )
  };
  const bodies: any[] = result.rivers.map((r) => ({
    id: r.id,
    terrain,
    shape: {
      kind: "river",
      speed: r.speed,
      course: {
        id: r.id,
        points: r.points.map((p) => ({ ...p, depth: p.elevation - sampleWaterTerrainHeight(terrain, p.x, p.z)! }))
      }
    },
    connections: [{ id: `${r.id}:mouth`, targetId: "ocean", ...r.mouth }]
  }));
  bodies.push({
    id: "ocean",
    terrain,
    connections: [],
    shape: {
      kind: "ocean",
      waterLevel: 0,
      boundaryConnected: true,
      excludedAreas: island.landPolygons,
      layout: {
        schemaVersion: 1,
        kind: "ocean-surface-layout",
        centerXZ: [128, 128],
        size: 256,
        surfaceTopology: "finite",
        finitePatchGridSize: 16
      }
    }
  });
  const graph = compileWaterConnectionGraph(bodies);
  const { sampleWaterConnection } = await import("@galacean/engine-water/water/authoring/connections/WaterConnection");
  for (const river of result.rivers) {
    const a = river.points.at(-2)!,
      b = river.points.at(-1)!;
    const length = Math.hypot(b.x - a.x, b.z - a.z),
      dx = (b.x - a.x) / length,
      dz = (b.z - a.z) / length;
    const upstream = [a.x - dx, a.z - dz],
      downstream = [a.x + dx, a.z + dz];
    expect(sampleWaterConnection(graph.byBody[river.id], ...(upstream as [number, number])).covered).toBe(true);
    expect(sampleWaterConnection(graph.byBody[river.id], ...(downstream as [number, number])).covered).toBe(false);
    expect(sampleWaterConnection(graph.byBody.ocean, ...(upstream as [number, number])).covered).toBe(false);
    expect(sampleWaterConnection(graph.byBody.ocean, ...(downstream as [number, number])).covered).toBe(true);
  }
});

it("compiles a 1024m coast with coarse Ocean, one-metre accepted refinements and native shore queries", async () => {
  const { compileWaterConnectionGraph } = await import("@galacean/engine-water/water/native/WaterConnectionAuthoring");
  const { RiverNetworkCompiler } = await import("@galacean/engine-water/water/compiler/river/RiverNetworkCompiler");
  const { OceanNearshoreCompiler } = await import("@galacean/engine-water/water/compiler/ocean/OceanNearshoreCompiler");
  const { OceanWaterSurfaceProvider } = await import(
    "@galacean/engine-water/water/runtime/ocean/OceanWaterSurfaceProvider"
  );
  const { createWaterSpatialFieldSample } = await import(
    "@galacean/engine-water/water/runtime/spatial/WaterSpatialFieldProvider"
  );
  const polygons = [
    [
      { x: 128, z: 128 },
      { x: 896, z: 128 },
      { x: 896, z: 896 },
      { x: 128, z: 896 }
    ]
  ];
  const result = generateTerrainHydrology({
    seed: 42,
    width: 1024,
    depth: 1024,
    landPolygons: polygons,
    heightAt: (x, z) => Math.min(x - 128, 896 - x, z - 128, 896 - z) * 0.12,
    ocean: true,
    rivers: { countMin: 2, countMax: 2 },
    lakes: { countMin: 1, countMax: 1 }
  });
  expect(result.rivers).toHaveLength(2);
  expect(result.lakes).toHaveLength(1);
  const decode = (x: number, z: number) =>
    (Math.round(((result.heightAt(x, z) + 64) / 192) * 65535) / 65535) * 192 - 64;
  // A single merged crop avoids overlap ownership. All nodes are final RG16 values.
  const all = result.rivers.flatMap((r) => r.outline);
  const x0 = Math.max(0, Math.floor(Math.min(...all.map((p) => p.x))) - 32),
    z0 = Math.max(0, Math.floor(Math.min(...all.map((p) => p.z))) - 32);
  const x1 = Math.min(1024, Math.ceil(Math.max(...all.map((p) => p.x))) + 32),
    z1 = Math.min(1024, Math.ceil(Math.max(...all.map((p) => p.z))) + 32);
  const columns = x1 - x0 + 1,
    rows = z1 - z0 + 1;
  const bed = {
    id: "accepted-rivers",
    revision: 1,
    origin: [x0, z0] as const,
    spacing: 1,
    columns,
    rows,
    surface: "float32-triangles" as const,
    heights: Array.from({ length: columns * rows }, (_, i) => decode(x0 + (i % columns), z0 + Math.floor(i / columns)))
  };
  expect(columns * rows).toBeLessThanOrEqual(1048576);
  const oceanBed = {
    id: "ocean-bed",
    revision: 1,
    origin: [0, 0] as const,
    spacing: 1024 / 255,
    columns: 256,
    rows: 256,
    heights: Array.from({ length: 65536 }, (_, i) =>
      decode(((i % 256) * 1024) / 255, (Math.floor(i / 256) * 1024) / 255)
    ),
    refinements: [bed]
  };
  const oceanShape = {
    kind: "ocean" as const,
    waterLevel: 0,
    boundaryConnected: true,
    excludedAreas: polygons,
    layout: {
      schemaVersion: 1 as const,
      kind: "ocean-surface-layout" as const,
      centerXZ: [512, 512] as const,
      size: 1024,
      surfaceTopology: "finite" as const,
      finitePatchGridSize: 16
    }
  };
  const oceanAsset = compileWaterShape(oceanShape, oceanBed, "ocean");
  const descriptor = (oceanAsset.source as any).descriptor.config.nearshoreDescriptor;
  const oceanCompiled = OceanNearshoreCompiler.compile(descriptor);
  expect(oceanCompiled.valid, JSON.stringify(oceanCompiled.diagnostics)).toBe(true);
  const provider = new OceanWaterSurfaceProvider(
    "ocean",
    descriptor,
    oceanCompiled.data!.staticAtlas,
    { minX: 0, minZ: 0, maxX: 1024, maxZ: 1024 },
    () => 0
  );
  const bodies: any[] = [];
  for (const r of result.rivers) {
    const shape = {
      kind: "river" as const,
      speed: r.speed,
      course: {
        id: r.id,
        points: r.points.map((p) => ({ ...p, depth: p.elevation - sampleWaterTerrainHeight(bed, p.x, p.z)! }))
      }
    };
    const asset = compileWaterShape(shape, bed, r.id);
    const { resolveWatercourse } = await import("@galacean/engine-water/water/authoring/river/Watercourse");
    const { createWatercourseRiver } = await import("@galacean/engine-water/water/authoring/river/WatercourseGeometry");
    const course = resolveWatercourse(shape.course, (x, z) => sampleWaterTerrainHeight(bed, x, z), {
      terrainSurface: "bed"
    });
    const compiled = RiverNetworkCompiler.compile(createWatercourseRiver(course, { terrain: bed, speed: shape.speed }));
    expect(compiled.valid, JSON.stringify(compiled.diagnostics)).toBe(true);
    bodies.push({ id: r.id, shape, terrain: bed, connections: [{ id: "mouth", targetId: "ocean", ...r.mouth }] });
    const [a, b] = r.mouth!.section;
    const x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2;
    const sample = createWaterSpatialFieldSample();
    expect(provider.sampleSpatialField(x, z, sample)).toBe(true);
    expect(sample.wet).toBe(true);
    expect(sample.surfaceHeight).toBe(0);
    expect(sample.waterDepth).toBeGreaterThan(0);
    // Ocean's published 4m field is an approximation; retain its documented spatial error, not an equality claim.
    expect(Math.abs(sample.waterDepth + sampleWaterTerrainHeight(oceanBed, x, z)!)).toBeLessThan(0.6);
  }
  bodies.push({ id: "ocean", shape: oceanShape, terrain: oceanBed, connections: [] });
  expect(() => compileWaterConnectionGraph(bodies)).not.toThrow();
  const inland = createWaterSpatialFieldSample();
  provider.sampleSpatialField(512, 512, inland);
  expect(inland.wet).toBe(false);
}, 30000);

it("reports empty land and rejects invalid and over-budget input before allocating", () => {
  const empty = generateTerrainHydrology({ ...input, landPolygons: [], rivers: { countMin: 2, countMax: 2 } });
  expect(empty.counts.rivers).toEqual({ target: 2, actual: 0 });
  expect(empty.diagnostics).toHaveLength(1);
  expect(() => generateTerrainHydrology({ ...input, rivers: { countMin: 65, countMax: 65 } })).toThrow(
    "RESOURCE_LIMIT"
  );
  expect(() => generateTerrainHydrology({ ...input, width: 20000 })).toThrow("RESOURCE_LIMIT");
  expect(() => generateTerrainHydrology({ ...input, rivers: { countMin: 1 } as any })).toThrow("countMax");
  expect(() =>
    generateTerrainHydrology({ ...input, lakes: { countMin: 1, countMax: 1 }, heightAt: () => NaN })
  ).toThrow("nonfinite");
});

it("keeps generated lake shore closed after neighbouring river bank grading", () => {
  const size = 1024;
  const result = generateTerrainHydrology({
    ...input,
    width: size,
    depth: size,
    landPolygons: [
      [
        { x: 0, z: 0 },
        { x: size, z: 0 },
        { x: size, z: size },
        { x: 0, z: size }
      ]
    ],
    heightAt: (x, z) => 35 + 15 * Math.sin(x / 110) * Math.cos(z / 130),
    rivers: { countMin: 2, countMax: 2 },
    lakes: { countMin: 1, countMax: 1 }
  });
  expect(result.lakes).toHaveLength(1);
  let maximumGap = -Infinity;
  for (const lake of result.lakes)
    for (let i = 0; i < lake.shoreline.length; i++) {
      const a = lake.shoreline[i],
        b = lake.shoreline[(i + 1) % lake.shoreline.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
      for (let j = 0; j < steps; j++) {
        const x = a.x + ((b.x - a.x) * j) / steps,
          z = a.z + ((b.z - a.z) * j) / steps;
        maximumGap = Math.max(maximumGap, lake.referenceLevel + lake.levelOffsetM - result.heightAt(x, z));
      }
    }
  expect(maximumGap).toBeLessThanOrEqual(0.01);
});

it("closes the actual seed42 Editor lake on final RG16 terrain after river-mouth grading", () => {
  const bytes = readFileSync(new URL("./fixtures/editor-seed42-field.f32", import.meta.url));
  const values = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const h = (i: number) => values.getFloat32(i * 4, true);
  const heightAt = (x: number, z: number) => {
    const i = Math.min(255, Math.floor(x / 4)),
      j = Math.min(255, Math.floor(z / 4)),
      u = x / 4 - i,
      v = z / 4 - j,
      k = j * 257 + i;
    return (h(k) * (1 - u) + h(k + 1) * u) * (1 - v) + (h(k + 257) * (1 - u) + h(k + 258) * u) * v;
  };
  const source = {
    seed: 42,
    width: 1024,
    depth: 1024,
    landPolygons: editorLand,
    heightAt,
    ocean: true,
    rivers: { countMin: 2, countMax: 2 },
    lakes: { countMin: 1, countMax: 1 }
  };
  const result = generateTerrainHydrology(source);
  expect(result.rivers).toHaveLength(2);
  expect(result.lakes).toHaveLength(1);
  const lake = result.lakes[0],
    level = lake.referenceLevel + lake.levelOffsetM;
  const x0 = Math.floor(Math.min(...lake.shoreline.map((p) => p.x))) - 4,
    z0 = Math.floor(Math.min(...lake.shoreline.map((p) => p.z))) - 4;
  const columns = Math.ceil(Math.max(...lake.shoreline.map((p) => p.x))) + 4 - x0 + 1;
  const rows = Math.ceil(Math.max(...lake.shoreline.map((p) => p.z))) + 4 - z0 + 1;
  const terrain = {
    id: "final-RG16",
    revision: 1,
    origin: [x0, z0] as const,
    spacing: 1,
    columns,
    rows,
    surface: "float32-triangles" as const,
    heights: Array.from({ length: columns * rows }, (_, i) => {
      const x = x0 + (i % columns),
        z = z0 + Math.floor(i / columns),
        value = result.heightAt(x, z);
      expect(value).toBeLessThanOrEqual(heightAt(x, z) + 1e-8);
      return (Math.round(((value + 32) / 160) * 65535) / 65535) * 160 - 32;
    })
  };
  let maxFloatGap = -Infinity,
    maxDecodedGap = -Infinity;
  for (let i = 0; i < lake.shoreline.length; i++) {
    const a = lake.shoreline[i],
      b = lake.shoreline[(i + 1) % lake.shoreline.length],
      count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
    for (let j = 0; j < count; j++) {
      const x = a.x + ((b.x - a.x) * j) / count,
        z = a.z + ((b.z - a.z) * j) / count;
      maxFloatGap = Math.max(maxFloatGap, level - result.heightAt(x, z));
      maxDecodedGap = Math.max(maxDecodedGap, level - sampleWaterTerrainHeight(terrain, x, z)!);
    }
  }
  console.log(JSON.stringify({ level, maxFloatGap, maxDecodedGap }));
  expect(maxFloatGap).toBeLessThanOrEqual(0.01);
  // One-metre triangles cut across the curved bank; report that sampling error separately.
  expect(maxDecodedGap).toBeLessThanOrEqual(0.15);
});
