import { describe, expect, it } from "vitest";
import { buildCoreHouses } from "../src/building/application/CoreEuropean";
import { prepareBuildingOnGround } from "../src/building/parts/architecture/BuildingCpu";
import {
  bakeBuildingWall,
  buildingWallBakeInputs,
  withBuildingWallBakeTransform,
  type WallBakeEdge
} from "../src/building/runtime/BuildingWallBakeInput";
import { constructionGeometry } from "./fixtures/constructionGeometry";

function prepareView(id: string, x = 0, z = 0, rotation = 0, lit = true, width = 8, u = 0.33, intensity?: number) {
  const draft = buildCoreHouses([
    {
      id,
      seed: 1987,
      rectangle: { center: [x, z], size: [width, 6], rotation },
      height: 4,
      attachments: lit
        ? [
            {
              id: id + "-lamp",
              kind: "wall-lamp",
              u,
              bottom: 1.5,
              width: 0.38,
              height: 0.68,
              ...(intensity === undefined ? {} : { lightIntensity: intensity })
            }
          ]
        : []
    }
  ]);
  return prepareBuildingOnGround(
    draft,
    { height: (px, pz) => 3 + x * 0.5 + px * 0.034 - pz * 0.015, grounding: { originY: 0, renderPosition: [0, 0, 0] } },
    constructionGeometry
  );
}

const prepare = (...args: Parameters<typeof prepareView>) => prepareView(...args).wallBakes;

describe("building wall light types", () => {
  it("uses the original warm yellow when a wall lamp has no color or intensity override", () => {
    const [lamp] = prepareView("authored-default").wallLamps;
    expect(lamp.intensity).toBeCloseTo(1.4);
    const hdr = lamp.color.map((channel) => channel * lamp.intensity);
    [1.4, 1.12, 0.14].forEach((value, i) => expect(hdr[i]).toBeCloseTo(value));
  });

  it("shares solved wall fields across different IDs, placement, rotation and ground elevation", () => {
    const [a] = prepare("a"),
      [b] = prepare("llm-clone", 18, 22, 0.7);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(b.origin).not.toEqual(a.origin);
    expect(b.key).toEqual(a.key);
    expect(a.planar).toBe(true);
    expect(a.typeKey).toBe(b.typeKey);
    expect(a.edges).toHaveLength(1);
    expect(a.lamp.range).toBeGreaterThan(0);
    expect(a.lampId).toBeTruthy();
    const dark = prepareView("a", 0, 0, 0, true, 8, 0.33, 0);
    expect(dark.wallBakes[0]).toEqual(a);
    expect(dark.wallLamps).toHaveLength(1);
    expect(dark.wallLamps[0]).toMatchObject({ id: a.lampId, decorationId: a.partId, ownerId: a.owner, intensity: 0 });
    expect(dark.preview.decorationParts.find((p) => p.id === a.lampId)?.decorationId).toBe(a.partId);
    const image = bakeBuildingWall(a);
    expect(image.pixels.some(Boolean)).toBe(true);
    expect(image.charts.filter(({ tile }) => tile)).toHaveLength(1);
    expect(image.pixels).toBeInstanceOf(Uint16Array);
    expect(image.charts[0].tile).toBeDefined();
    expect(image.format).toBe("r16f");
    expect(image.pixels).toHaveLength(image.width * image.height);
  });
  it("preserves both contributing walls at a corner and distinct overlapping lamps", () => {
    const walls: WallBakeEdge[] = [
      [-3, 3, 3, 3],
      [3, 3, 3, -3],
      [3, -3, -3, -3],
      [-3, -3, -3, 3]
    ];
    const group = { id: "corner", seed: 1 };
    const light = {
      id: "corner-emitter",
      decorationId: "corner-part",
      ownerId: group.id,
      position: [3.2, 2, 3.2] as [number, number, number],
      color: [1, 0.8, 0.1] as [number, number, number],
      intensity: 1.4,
      range: 3.5
    };
    const contours = new Map([[group.id, walls]]);
    const [corner] = buildingWallBakeInputs([group], contours, [light]);
    expect(corner.planar).toBeUndefined();
    const cornerAtlas = bakeBuildingWall(corner);
    expect(cornerAtlas.charts).toHaveLength(4);
    expect(cornerAtlas.charts.filter(({ tile }) => tile)).toHaveLength(2);
    const alongWall = {
      ...light,
      id: "front-emitter",
      decorationId: "front-part",
      position: [0, 2, 3.2] as [number, number, number]
    };
    const [plane] = buildingWallBakeInputs([group], contours, [alongWall]);
    expect(plane.planar).toBe(true);
    const [changedLamp] = buildingWallBakeInputs([group], contours, [{ ...alongWall, intensity: 2.2 }]);
    expect(changedLamp).toEqual(plane);
    const [blue] = buildingWallBakeInputs([group], contours, [{ ...alongWall, color: [0, 0, 1] }]);
    expect(blue).toEqual(plane);
    const [off] = buildingWallBakeInputs([group], contours, [{ ...alongWall, intensity: 0 }]);
    expect(off).toEqual(plane);
    const combined = buildingWallBakeInputs([group], contours, [alongWall, light]);
    expect(combined).toHaveLength(2);
    expect(combined.find((entry) => entry.lampId === light.id)?.key).toBe(corner.key);
    expect(combined.find((entry) => entry.lampId === alongWall.id)?.key).toBe(plane.key);
    expect(new Set(combined.map((entry) => entry.typeKey)).size).toBe(1);

    const neighbour = {
      ...alongWall,
      id: "neighbour-emitter",
      decorationId: "neighbour-part",
      position: [1, 2.4, 3.2] as [number, number, number],
      color: [0, 0, 1] as [number, number, number],
      intensity: 0.7
    };
    const overlaps = buildingWallBakeInputs([group], contours, [alongWall, neighbour]);
    expect(overlaps).toHaveLength(2);
    const front = overlaps.find((entry) => entry.partId === alongWall.decorationId)!;
    const other = overlaps.find((entry) => entry.partId === neighbour.decorationId)!;
    expect(front.key).toBe(other.key);
    expect(other.origin).not.toEqual(front.origin);
    const edits = buildingWallBakeInputs([group], contours, [
      { ...neighbour, color: [1, 0, 0], intensity: 0 },
      alongWall
    ]);
    expect(edits).toHaveLength(2);
    expect(edits.find((entry) => entry.lampId === neighbour.id)).toEqual(other);
    expect(edits.find((entry) => entry.lampId === alongWall.id)).toEqual(front);
  });

  it("unwraps the actual exterior of a round tower continuously under scaling and shear", () => {
    const group = {
      id: "tower",
      seed: 11,
      shared: { house: { footprint: { circle: { center: [0, 0], radius: 4.65 } } } }
    };
    const radius = 4.933,
      count = 58;
    const point = (i: number): [number, number] => [
      radius * Math.sin((i * 2 * Math.PI) / count),
      radius * Math.cos((i * 2 * Math.PI) / count)
    ];
    const edges = Array.from({ length: count }, (_, i): WallBakeEdge => [...point(i), ...point((i + 1) % count)]);
    const [input] = buildingWallBakeInputs([group], new Map([[group.id, edges]]), [
      {
        id: "sconce",
        ownerId: group.id,
        position: [0.12, 2, -5.17],
        color: [1, 1, 1],
        intensity: 1,
        range: 3.5
      }
    ]);
    expect(input.circleRadius).toBe(radius);
    const uniformlyScaled = (scale: number) =>
      withBuildingWallBakeTransform(input, [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1]);
    // A uniformly enlarged tower can move the emitter beyond its fixed world range.
    // At a reachable distance the sphere, rather than the horizon, limits the allocation.
    const reachable = bakeBuildingWall(uniformlyScaled(10));
    expect(reachable.pixels.some(Boolean)).toBe(true);
    const tile = reachable.charts.find((chart) => chart.tile)!.tile!;
    const texelsPerMetre = tile.dv * reachable.height / 10;
    expect(reachable.width).toBeLessThan(2 * input.lamp.range * texelsPerMetre + 6);
    const unreachable = bakeBuildingWall(uniformlyScaled(16));
    const interior = bakeBuildingWall({ ...input, lamp: { ...input.lamp, position: [0, 0, radius - 0.1] } });
    for (const empty of [unreachable, interior]) {
      expect([empty.width, empty.height]).toEqual([1, 1]);
      expect(empty.charts.every(({ tile }) => !tile)).toBe(true);
      expect(empty.pixels.every((value) => value === 0)).toBe(true);
    }

    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (const frame of [identity, [1.6, 0.25, 0, 0, 0.12, 0.9, 0.15, 0, 0, -0.1, 0.75, 0, 0, 0, 0, 1]]) {
      const source = withBuildingWallBakeTransform(input, frame);
      const atlas = bakeBuildingWall(source);
      const origins = atlas.charts.flatMap(({ tile }) => tile ? [tile.darkUV.join(",")] : []);
      expect(new Set(origins).size).toBe(1);
      const m = source.matrix ?? identity,
        inv = source.inverse ?? identity;
      const seams = new Map<string, number>();
      let checked = 0;
      for (const [index, edge] of source.edges.entries()) {
        const chart = atlas.charts[index],
          tile = chart.tile;
        if (!tile) continue;
        for (const [x, z] of [
          [edge[0], edge[1]],
          [edge[2], edge[3]]
        ]) {
          const u = (chart.nz * x - chart.nx * z) * tile.du + tile.offsetU;
          const key = x + "," + z;
          if (!seams.has(key)) {
            seams.set(key, u);
            continue;
          }
          expect(Math.abs(u - seams.get(key)!)).toBeLessThan(1e-7);
          const nx = x / Math.hypot(x, z),
            nz = z / Math.hypot(x, z);
          const vx = source.lamp.position[0] - radius * nx,
            vz = source.lamp.position[2] - radius * nz;
          for (const h of [-0.7, 0.6]) {
            const v = h * tile.dv + tile.offsetV;
            const d = Math.hypot(...[0, 1, 2].map((k) => m[k] * vx - m[k + 4] * h + m[k + 8] * vz));
            const normalLength = Math.hypot(...[0, 4, 8].map((k) => nx * inv[k] + nz * inv[k + 2]));
            const cosine = Math.max(0, (nx * vx + nz * vz) / (d * normalLength));
            const q = (d / source.lamp.range) ** 2;
            const diffuse = 0.96 * (1 - q ** 2) ** 2 / (d * d);
            const wallFill = (1 - q) ** 2 / (1 + d * d);
            const expected = q < 1 ? cosine * (diffuse + wallFill) : 0;
            // The GPU linearly samples half-floats around each projected UV.
            const px = Math.max(0, Math.min(atlas.width - 1, u * atlas.width - 0.5));
            const py = Math.max(0, Math.min(atlas.height - 1, v * atlas.height - 0.5));
            const ix = Math.floor(px),
              iy = Math.floor(py);
            let sampled = 0;
            for (const [row, wy] of [
              [iy, 1 - (py - iy)],
              [Math.min(iy + 1, atlas.height - 1), py - iy]
            ]) {
              for (const [col, wx] of [
                [ix, 1 - (px - ix)],
                [Math.min(ix + 1, atlas.width - 1), px - ix]
              ]) {
                const bits = atlas.pixels[row * atlas.width + col],
                  exponent = bits >> 10;
                const value = exponent ? (1 + (bits & 1023) / 1024) * 2 ** (exponent - 15) : bits * 2 ** -24;
                sampled += wx * wy * value;
              }
            }
            expect(Math.abs(sampled - expected)).toBeLessThan(0.012 + expected * 0.025);
            if (expected > 0.05) checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(4);
    }
  });

  it("uses one planar image with four distinct lightmap projections on a four-sided house", () => {
    const group = { id: "house", seed: 42 };
    const walls: WallBakeEdge[] = [
      [-3, 3, 3, 3],
      [3, 3, 3, -3],
      [3, -3, -3, -3],
      [-3, -3, -3, 3]
    ];
    const lamps = walls.map(([ax, az, bx, bz], i) => {
      const length = Math.hypot(bx - ax, bz - az);
      return {
        id: `sconce-${i}`,
        ownerId: group.id,
        position: [(ax + bx) / 2 - (0.2 * (bz - az)) / length, 2, (az + bz) / 2 + (0.2 * (bx - ax)) / length] as [
          number,
          number,
          number
        ],
        color: [1, 1, 1] as [number, number, number],
        intensity: i,
        range: 3.5
      };
    });
    const inputs = buildingWallBakeInputs([group], new Map([[group.id, walls]]), lamps);
    expect(inputs).toHaveLength(4);
    expect(new Set(inputs.map((entry) => entry.key)).size).toBe(1);
    expect(new Set(inputs.map((entry) => entry.yaw)).size).toBe(4);
    const scaled = inputs.map((entry) =>
      withBuildingWallBakeTransform(entry, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    );
    expect(new Set(scaled.map((entry) => entry.typeKey)).size).toBe(1);
    expect(new Set(scaled.map((entry) => entry.key)).size).toBe(2);
  });

  it("shares the same lit patch across different facades, invalidates for scale, and skips unlit owners", () => {
    const [a] = prepare("source");
    expect(prepare("dark", 0, 0, 0, false)).toEqual([]);
    for (const sample of [prepare("moved-lamp", 0, 0, 0, true, 8, 0.42)[0], prepare("wide", 0, 0, 0, true, 10)[0]]) {
      expect(sample.typeKey).not.toBe(a.typeKey);
      expect(sample.key).toBe(a.key);
    }
    const rotated = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 123, 32, 58, 1];
    expect(withBuildingWallBakeTransform(a, rotated)).toBe(a);
    rotated[2] = -2;
    const scaled = withBuildingWallBakeTransform(a, rotated);
    expect(scaled.key).not.toBe(a.key);
    expect(bakeBuildingWall(scaled).pixels.some(Boolean)).toBe(true);
  });
});
