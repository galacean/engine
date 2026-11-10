// A closed surface has no seam: what is removed across u = 0 is removed on both sides of it,
// for every algorithm that gives way to removed areas and for the distance view.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import {
  createBuildingRegistry,
  designBuildingCore,
  EffectiveGeometry,
  expandUnits,
  type BuildingGeometry,
  type CurveData,
  type Rect,
  type ResolvedPart
} from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  type CoreHouseParameters,
  type CoreWallAttachment
} from "../../src/building/application/CoreEuropean";
import { coreBuildingEnvironment, coreBuildingLayout, coreBuildingView } from "../../src/building/render/CoreBuilding";

const curve = (closed: boolean): CurveData => ({
  points: [
    [0, 0, 0],
    [4, 0, 0],
    [4, 0, 4],
    [0, 0, 4]
  ],
  closed
});
const extruded = (closed: boolean): BuildingGeometry => ({
  elements: { face: { kind: "surface", surface: { kind: "extrusion", params: { curve: curve(closed), height: 2 } } } }
});
const coreRegistry = createBuildingRegistry();
const surface = (closed: boolean, rect: Rect) =>
  new EffectiveGeometry(extruded(closed), [{ element: "face", op: "removeArea", rect }], coreRegistry.surfaces).surface(
    "face"
  );

const near = (actual: readonly Rect[], expected: Rect[]) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((r, i) => r.forEach((x, k) => expect(x).toBeCloseTo(expected[i][k], 9)));
};

describe("Removed areas on a closed surface", () => {
  it("are found from either side of the seam, in the asking range's u", () => {
    const across = surface(true, [15.7, 0, 16.3, 1]);
    expect(across.domain.u).toEqual([0, 16]);
    near(across.removedOver(0, 1), [[-0.3, 0, 0.3, 1]]);
    near(across.removedOver(15, 16), [[15.7, 0, 16.3, 1]]);
    near(across.removedOver(31.9, 32.5), [[31.7, 0, 32.3, 1]]);
    expect(across.removedOver(1, 15)).toEqual([]);
    expect(across.removedAt(0.1, 0.5)).toBe(true);
    expect(across.removedAt(15.9, 0.5)).toBe(true);
    expect(across.removedAt(1, 0.5)).toBe(false);
    expect(across.contains(0.1, 0.5)).toBe(false);
    expect(across.covers([0, 0, 1, 1])).toBe(false);
    // An open surface has an end, not a seam.
    const open = surface(false, [11.7, 0, 12.3, 1]);
    expect(open.removedOver(-0.5, 0.5)).toEqual([]);
    near(open.removedOver(11, 12), [[11.7, 0, 12.3, 1]]);
  });

  it("trims grid units on both sides of the seam as anywhere else", () => {
    const columns = (rect: Rect) => {
      const result = designBuildingCore(
        {
          groups: [{ id: "g", seed: 1 }],
          parts: [
            {
              id: "p",
              group: "g",
              type: "thing",
              geometry: { generator: "elements", params: extruded(true) },
              algorithm: { type: "surfaceGrid", params: { cell: [1, 1], trim: true } },
              unit: {
                source: "box",
                bounds: { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0.1] },
                range: { min: [0.1, 0.1, 1], max: [1, 1, 1] }
              }
            }
          ]
        },
        coreRegistry
      );
      const part = { ...result.parts[0], modifications: [{ element: "face", op: "removeArea", rect } as const] };
      return expandUnits(part, coreRegistry, {})
        .filter((u) => u.key.startsWith("face:0:"))
        .map((u) => (u.params!.uv as number[])[0]);
    };
    const middle = columns([7.7, 0, 8.3, 1]);
    expect(middle).toContain(7.35);
    expect(middle).toContain(8.65);
    for (const across of [columns([15.7, 0, 16.3, 1]), columns([-0.3, 0, 0.3, 1])]) {
      expect(across).toHaveLength(middle.length);
      expect(across[0]).toBeCloseTo(0.65, 6);
      expect(across.at(-1)).toBeCloseTo(15.35, 6);
    }
  });
});

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const assets = nativeAssets.compilation;
const environment = coreBuildingEnvironment(flat, assets);
const round = (attachment: CoreWallAttachment, extra: Partial<CoreHouseParameters> = {}): CoreHouseParameters => ({
  id: "h",
  height: 7,
  circle: { center: [0, 0], radius: 4, phase: 0 },
  floors: { interval: 3.5 },
  attachments: [attachment],
  ...extra
});
const window = (u: number): CoreWallAttachment => ({
  id: "w",
  kind: "window",
  u,
  bottom: 2.9,
  width: 1.2,
  height: 1.2
});
const perimeter = (part: ResolvedPart, element: string) =>
  new EffectiveGeometry(part.original, part.modifications, registry.surfaces).surface(element).domain.u[1];
/** Units of a part whose centre lies in one of its removed areas, in any period. */
function unitsInHoles(part: ResolvedPart): number {
  const units = expandUnits(part, registry, { environment });
  let inside = 0;
  for (const m of part.modifications) {
    if (m.op !== "removeArea") continue;
    const length = perimeter(part, m.element);
    const [u0, v0, u1, v1] = m.rect;
    for (const unit of units) {
      const at = unit.params?.wallU as number[] | undefined;
      if (!at) continue;
      const u = ((((at[0] + at[1]) / 2) % length) + length) % length,
        y = unit.frame.origin[1];
      if (y > v0 + 0.1 && y < v1 - 0.1 && [-length, 0, length].some((s) => u + s > u0 + 0.05 && u + s < u1 - 0.05))
        inside++;
    }
  }
  return inside;
}

describe("Openings across the seam of a round house", () => {
  const cases: [string, CoreWallAttachment][] = [
    ["a window at u = 0", window(0)],
    ["a window just after the seam", window(0.01)],
    ["a window just before the seam", window(0.99)],
    ["a door at u = 0", { id: "d", kind: "door", u: 0, bottom: 0, width: 1.2, height: 2.2 }],
    ["an arch at u = 0", { id: "a", kind: "opening", u: 0, bottom: 0, width: 1.6, height: 2.4 }]
  ];
  for (const walls of [undefined, "grid", "timber"] as const)
    for (const [name, attachment] of cases)
      it(`leave ${name} open in a ${walls ?? "masonry"} wall and its band`, () => {
        const result = designBuildingCore(buildCoreHouse(round(attachment, { walls })), registry, { environment });
        expect(result.diagnostics).toEqual([]);
        for (const part of result.parts.filter((p) => p.type === "wall" || p.type === "floorBand"))
          expect(unitsInHoles(part), part.type).toBe(0);
      });

  it("cut the band only where the opening is", () => {
    const bandUnits = (u: number) => {
      const result = designBuildingCore(buildCoreHouse(round(window(u))), registry, { environment });
      const band = result.parts.find((p) => p.type === "floorBand")!;
      return expandUnits(band, registry, { environment }).length;
    };
    const elsewhere = bandUnits(0.3);
    expect(elsewhere).toBeGreaterThan(20);
    for (const u of [0, 0.01, 0.99]) expect(bandUnits(u), `u = ${u}`).toBe(elsewhere);
  });

  it("stay open in the distance view on both sides of the seam", () => {
    const result = designBuildingCore(buildCoreHouse(round(window(0), { floors: undefined })), registry, {
      environment
    });
    const layout = coreBuildingLayout(result, registry, { environment: { ground: flat } });
    const walls = coreBuildingView(layout, { assets }).parts.filter((p) => p.bindingId === "h-wall");
    expect(walls.length).toBeGreaterThan(0);
    const wall = result.parts.find((p) => p.type === "wall")!;
    const face = new EffectiveGeometry(wall.original, wall.modifications, registry.surfaces).surface("face");
    const [u0, v0, u1, v1] = wall.modifications.find((m) => m.op === "removeArea")!.rect as Rect;
    const length = face.domain.u[1];
    // A ray in through the wall at u: does a wall triangle stop it?
    const blocked = (u: number) => {
      const f = face.frame(((u % length) + length) % length, (v0 + v1) / 2);
      const from = [0, 1, 2].map((i) => f.origin[i] + f.z[i] * 2),
        direction = f.z.map((x) => -x);
      return walls.some((p) => {
        for (let i = 0; i < p.indices.length; i += 3) {
          const [a, b, c] = [0, 1, 2].map((k) => p.positions.slice(p.indices[i + k] * 3, p.indices[i + k] * 3 + 3));
          if (rayHits(from, direction, a, b, c, 4)) return true;
        }
        return false;
      });
    };
    expect(u1 > length && u0 < length).toBe(true);
    expect(blocked(u0 + 0.2)).toBe(false);
    expect(blocked(u1 - 0.2)).toBe(false);
    expect(blocked(u1 + 0.4)).toBe(true);
  });
});

/** Möller–Trumbore: whether the ray from `o` along `d` meets triangle abc within `limit`. */
function rayHits(o: number[], d: number[], a: number[], b: number[], c: number[], limit: number): boolean {
  const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p: number[], q: number[]) => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0]
  ];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const e1 = sub(b, a),
    e2 = sub(c, a),
    p = cross(d, e2),
    det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return false;
  const t0 = sub(o, a),
    u = dot(t0, p) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(t0, e1),
    v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, q) / det;
  return t > 0 && t < limit;
}
