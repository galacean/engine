vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  type CoreHouseParameters,
  type CoreRoofAttachment
} from "../../src/building/application/CoreEuropean";
import {
  compileCoreBuilding,
  coreBuildingDecorations,
  coreBuildingEnvironment,
  coreBuildingGrounding,
  coreBuildingLayout,
  prepareCoreBuilding
} from "../../src/building/render/CoreBuilding";
import { ConstructionSurfaceQuery } from "../../src/building/runtime/ConstructionSurfaceQuery";
import { buildBuildingRenderPackage } from "../../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../src/building/runtime/BuildingGlobals";
import { resolveDocument } from "../../src/building/runtime/PlacementDocument.js";
import { baseline, digest, frozen } from "./baseline";
import { meshPrint, type MeshPrint } from "./meshPrint";
import { planFacadeDecorations, normalizeDecorationPlan } from "../../src/building/runtime/DecorationPlan";
import { normalizeProfileRoof } from "../../src/building/runtime/ProfileParameters";
import { isFlatRoofHeight } from "../../src/building/runtime/RoofMode";
import { decorationSize } from "./decorationSizes";

// Acceptance of the core render path against the online path, house by house. What online gave
// is frozen in baselines/CoreBuilding-*.json.
const flat = () => 0;
const registry = registerHouseTypes(createBuildingRegistry());
const environment = { ground: flat };
const HOUSES: [string, CoreHouseParameters][] = [
  ["hip roof", { id: "a" }],
  ["gable roof", { id: "g", roof: { ridge_length: 1 } }],
  ["steep roof", { id: "s", roof: { height: 0.8 } }],
  ["rotated house", { id: "r", rectangle: { center: [1, 2], size: [10, 7], rotation: 0.6 } }],
  ["flat roof", { id: "f", roof: { height: 0 }, roofUnit: "roof_tile" }],
  [
    "floor bands",
    {
      id: "b",
      height: 8,
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0.4 },
      floors: { enabled: true, interval: 3 }
    }
  ]
];
const core = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
/** What online gave for each house: where its structure rays hit (80 rays, in the order the test
 * casts them), its palette, preview bounds, solid distance units and distance-texture coverage,
 * its grounding, and its resident package. */
const HOUSE_ONLINE = baseline<{
  hits: (number[] | null)[];
  palette: { paletteSlots: object[]; colorOwners: string[] };
  bounds: { min: number[]; max: number[] };
  retained: number;
  coverage: Record<"brick" | "roof_tile", number | null>;
  grounding: {
    supports: { id: string; minGround: number; maxGround: number; topY: number }[];
    minWorldHeight: number;
    maxWorldHeight: number;
    localBounds: { min: number[]; max: number[] };
  };
  resident: { draws: number; units: number; backingParts: number };
}>("CoreBuilding-houses");
const pack = (input: Parameters<typeof buildBuildingRenderPackage>[0]) =>
  buildBuildingRenderPackage(input, nativeAssets, buildingGlobals(input.paletteSlots, nativeAssets.frame), true)
    .package;
/** Mean coverage of a surface's distance appearance over the pixels its mesh samples: every
 * pixel whose center lies inside a triangle of the mesh in the chart. In [0, 1]. */
function coverage(part: {
  uvs: number[][];
  indices: number[];
  lodAppearance?: { width: number; height: number; uvTransform: number[]; pixels: Uint8Array };
}) {
  const image = part.lodAppearance!;
  const [u0, v0, su, sv] = image.uvTransform;
  const px = (uv: number[]) => [(uv[0] - u0) * su * image.width, (uv[1] - v0) * sv * image.height];
  const seen = new Uint8Array(image.width * image.height);
  let sum = 0,
    count = 0;
  for (let i = 0; i < part.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => px(part.uvs[part.indices[i + k]]));
    const side = (p: number[], q: number[], x: number, y: number) =>
      (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    const area = side(a, b, c[0], c[1]);
    if (!area) continue;
    for (
      let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      y < Math.min(image.height, Math.ceil(Math.max(a[1], b[1], c[1])));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        x < Math.min(image.width, Math.ceil(Math.max(a[0], b[0], c[0])));
        x++
      ) {
        const k = y * image.width + x;
        if (seen[k]) continue;
        const cx = x + 0.5,
          cy = y + 0.5;
        const w = [side(b, c, cx, cy), side(c, a, cx, cy), side(a, b, cx, cy)].map((v) => v * Math.sign(area));
        if (w.some((v) => v < 0)) continue;
        seen[k] = 1;
        sum += image.pixels[k * 2 + 1] / 255;
        count++;
      }
  }
  return sum / count;
}

describe("Core render path against the online path", () => {
  it.each(HOUSES)(
    "%s: structure queries hit the same surfaces",
    (name, p) => {
      const hits = HOUSE_ONLINE[name].hits;
      const b = prepareCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const qb = new ConstructionSurfaceQuery(b.preview.structuralParts!, [0, 0, 0], (id) => id);
      const [cx, cz] = p.rectangle?.center ?? [0, 0];
      const flatRoof = p.roof?.height === 0;
      let rays = 0,
        ray = 0;
      for (const y of [1, 2.5, 3.6, 5, 6.5])
        for (let k = 0; k < 16; k++) {
          const angle = (k / 16) * 2 * Math.PI;
          const start: [number, number, number] = [cx + 20 * Math.cos(angle), y + 6, cz + 20 * Math.sin(angle)];
          const ha = hits[ray++],
            hb = qb.intersectSegment(start, [cx, y, cz]);
          expect(!!hb).toBe(!!ha);
          if (!ha || !hb) continue;
          // The online structure treats a parapet as a solid band; the core keeps its crenels.
          if (flatRoof && ha[1] > 2.85 - 1e-6) continue;
          expect(Math.hypot(...ha.map((v, i) => v - hb.position[i]))).toBeLessThan(0.1);
          rays++;
        }
      expect(rays).toBeGreaterThan(flatRoof ? 12 : 30);
    },
    60000
  );

  it.each(HOUSES)(
    "%s: same palette, similar bounds and distance appearance",
    (name, p) => {
      const a = HOUSE_ONLINE[name];
      const b = prepareCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      expect(b.appearance.paletteSlots).toEqual(a.palette.paletteSlots.map((s) => expect.objectContaining(s)));
      expect(b.appearance.colorOwners.map((o) => o.id)).toEqual(a.palette.colorOwners);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(b.preview.bounds.min[k] - a.bounds.min[k])).toBeLessThan(0.3);
        expect(Math.abs(b.preview.bounds.max[k] - a.bounds.max[k])).toBeLessThan(0.3);
      }
      // Units standing out of the walls stay solid at a distance, about as many as online.
      const retained = b.preview.retainedWallUnits.reduce((n, r) => n + r.cells.length, 0);
      expect(Math.abs(retained - a.retained)).toBeLessThanOrEqual(Math.max(4, 0.35 * a.retained));
      // Every textured surface online has a textured core counterpart.
      for (const material of ["brick", "roof_tile"] as const) {
        const theirs = a.coverage[material];
        const ib = b.preview.parts.find((x) => x.material === material && x.lodAppearance);
        expect(!!ib).toBe(theirs !== null);
        // The core surface is covered at least as well as the online one.
        if (theirs !== null && ib) expect(coverage(ib)).toBeGreaterThan(theirs - 0.1);
      }
    },
    60000
  );

  it.each(HOUSES)(
    "%s: same grounding supports and similar bounds",
    (name, p) => {
      const ground = { grounding: { originY: 0, renderPosition: [0, 0, 0] as [number, number, number] }, height: flat };
      const ga = HOUSE_ONLINE[name].grounding;
      const prepared = prepareCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const gb = coreBuildingGrounding(prepared.layout, prepared.preview, ground);
      expect(gb.supports!.map((s) => s.id)).toEqual(ga.supports.map((s) => s.id));
      for (const [sa, sb] of ga.supports.map((s, i) => [s, gb.supports![i]] as const)) {
        expect(sb.minGround).toBeCloseTo(sa.minGround, 6);
        expect(sb.maxGround).toBeCloseTo(sa.maxGround, 6);
        expect(sb.topY).toBeCloseTo(sa.topY, 6);
      }
      expect(gb.minWorldHeight).toBeCloseTo(ga.minWorldHeight, 6);
      expect(gb.maxWorldHeight).toBeCloseTo(ga.maxWorldHeight, 6);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(gb.localBounds!.min[k] - ga.localBounds.min[k])).toBeLessThan(0.6);
        expect(Math.abs(gb.localBounds!.max[k] - ga.localBounds.max[k])).toBeLessThan(0.6);
      }
      expect(gb.contacts!.belowTerrain).toBeLessThan(1e-9);
    },
    60000
  );

  it.each(HOUSES)(
    "%s: the resident package has the same draws and similar unit counts",
    async (name, p) => {
      const a = HOUSE_ONLINE[name].resident;
      const { renderInput: b } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      expect(pack(b).draws.length).toBe(a.draws);
      const units = b.groups.reduce((n, g) => n + g.cells.length, 0);
      expect(Math.abs(units - a.units) / a.units).toBeLessThan(0.12);
      expect(b.backingParts.length).toBe(a.backingParts);
    },
    60000
  );
});

/** Online's floor bands (count, levels, section) and plaster (area, wear, colour, wall length). */
const FINISH_ONLINE = frozen<{
  bands: Record<string, { count: number; levels: string[]; section: [number, number] }>;
  plaster: Record<string, { area: number; wear: number; color: number; wallLength: number }>;
}>("CoreBuilding-finish");
describe("Floor bands against the online path", () => {
  it.each([
    ["rectangle", { id: "a", height: 8, floors: { enabled: true, interval: 3.5 } }],
    [
      "rotated",
      {
        id: "h",
        height: 8,
        rectangle: { center: [0, 0], size: [9, 6], rotation: 0.4 },
        floors: { enabled: true, interval: 3 }
      }
    ],
    [
      "round",
      {
        id: "t",
        height: 11,
        circle: { center: [0, 0], radius: 3, phase: 0 },
        roof: { height: 0 },
        floors: { enabled: true, interval: 3.5 }
      }
    ]
  ] as [string, CoreHouseParameters][])(
    "%s: same band count, levels and section",
    async (name, p) => {
      const ba = FINISH_ONLINE.bands[name];
      const { renderInput: b } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const bb = b.groups.filter((g) => g.role === "floor-band").flatMap((g) => g.cells);
      expect(bb.length).toBe(ba.count);
      expect([...new Set(bb.map((c) => c.center[1].toFixed(3)))].sort()).toEqual(ba.levels);
      for (const c of bb) {
        expect(c.size[1]).toBeCloseTo(ba.section[0], 6);
        expect(c.size[2]).toBeCloseTo(ba.section[1], 6);
        expect(c.brick_flags).toBe(4);
      }
    },
    60000
  );
});

describe("Plaster against the online path", () => {
  const area = (p: { positions: number[]; indices: number[] }) => {
    let sum = 0;
    for (let k = 0; k < p.indices.length; k += 3) {
      const [a, b, c] = [0, 1, 2].map((j) => p.positions.slice(p.indices[k + j] * 3, p.indices[k + j] * 3 + 3));
      const u = b.map((v, j) => v - a[j]),
        w = c.map((v, j) => v - a[j]);
      sum += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    }
    return sum;
  };
  it.each([
    ["hip roof", { id: "a", plaster: { enabled: true, wear: 0.35, color: 3 } }],
    ["gable roof", { id: "g", roof: { ridge_length: 1 }, plaster: { enabled: true, wear: 0.2, color: 1 } }],
    [
      "round flat roof",
      {
        id: "t",
        height: 6,
        circle: { center: [0, 0], radius: 3, phase: 0 },
        roof: { height: 0 },
        plaster: { enabled: true, wear: 0.5, color: 5 }
      }
    ]
  ] as [string, CoreHouseParameters][])(
    "%s: a finish of the same area, wear and colour",
    async (name, p) => {
      const a = FINISH_ONLINE.plaster[name];
      const { renderInput: b } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const pb = b.surfaceParts.filter((x) => x.plaster);
      expect(pb.length).toBeGreaterThan(0);
      const sb = pb.reduce((n, x) => n + area(x), 0);
      expect(Math.abs(sb - a.area) / a.area).toBeLessThan(0.05);
      for (const x of pb) {
        expect(x.plaster!.wear).toBeCloseTo(a.wear, 6);
        expect(x.plaster!.color).toBe(a.color);
        expect(x.plaster!.wallLength).toBeCloseTo(a.wallLength, 4);
        expect(x.plaster!.edgeDistances.length).toBe(x.uvs.length);
        expect(x.normals!.length).toBe(x.positions.length);
      }
      // The finish is drawn, not backed.
      expect(b.backingParts.some((x) => x.plaster)).toBe(false);
    },
    60000
  );
  it.each([
    ["hip", {}],
    ["gable", { ridge_length: 1 }],
    ["flat", { height: 0 }]
  ] as [string, CoreHouseParameters["roof"]][])(
    "wears the walls under a %s roof from their height above the ground, as online does",
    async (_name, roof) => {
      const p: CoreHouseParameters = {
        id: "w",
        height: 4,
        rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
        roof,
        plaster: { enabled: true, wear: 0.35, color: 4 }
      };
      const { renderInput } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const walls = renderInput.surfaceParts.filter((x) => x.plaster);
      expect(walls.length).toBeGreaterThan(0);
      // The ground is flat at 0: every point of the finish wears as high as it stands, so the
      // roof above cannot change how the foot of the wall wears.
      for (const x of walls) x.uvs.forEach((uv, i) => expect(uv[1]).toBeCloseTo(x.positions[i * 3 + 1], 6));
    },
    60000
  );
});

/** Online's wall prefabs per house: a fingerprint of each decoration part's mesh with digests of
 * its colours, emission and appearance; the wall holes it opened; its stone hats. */
const PREFAB_ONLINE = baseline<{
  parts: (MeshPrint & { id: string; colors: string; emission: string; kinds: string; colorIds: string })[];
  holes: { decorationId: string; centerU: number; centerY: number; width: number; height: number }[];
  stones: {
    template: string;
    flags: number;
    position: number[];
    bones: { position: number[]; normalXZ: number[] }[];
  }[];
}>("CoreBuilding-prefabs");
/** How far two meshes' fingerprints are apart: positions, normals and uvs. */
const printDeviation = (a: MeshPrint, b: MeshPrint) => {
  const d = (x: number[], y: number[]) => x.reduce((m, v, i) => Math.max(m, Math.abs(v - y[i])), 0);
  return {
    position: Math.max(
      d(a.center, b.center),
      d(a.min, b.min),
      d(a.max, b.max),
      ...a.samples.map((s, k) => d(s.position, b.samples[k].position))
    ),
    normal: Math.max(...a.samples.map((s, k) => d(s.normal, b.samples[k].normal))),
    uv: Math.max(...a.samples.map((s, k) => d(s.uv, b.samples[k].uv)))
  };
};
describe("Wall prefabs against the online path", () => {
  /** The facade the initial village plans for a house: windows, a door and a wall lamp. */
  const withFacade = (house: CoreHouseParameters): CoreHouseParameters => {
    const roof = normalizeProfileRoof(house.roof ?? {});
    const planned = planFacadeDecorations({ ...house, roof, wallStructure: "masonry" } as never);
    return { ...house, attachments: normalizeDecorationPlan(planned, isFlatRoofHeight(roof.height)) as never };
  };
  /** Gothic windows and a door, and arrow slits, at their original sizes. */
  const withStone = (house: CoreHouseParameters): CoreHouseParameters => {
    const size = (type: string, rank: number) => decorationSize(type, rank);
    const at = (id: string, kind: string, type: string, rank: number, u: number, bottom: number) => ({
      id,
      kind,
      type,
      rank,
      u,
      bottom,
      width: size(type, rank).width,
      height: size(type, rank).height
    });
    return {
      ...house,
      attachments: [
        at("g1", "window", "window-gothic", 1, 0.06, 1.2),
        at("g2", "window", "window-gothic", 2, 0.19, 1.1),
        at("g3", "window", "window-gothic", 3, 0.31, 0.6),
        at("d1", "door", "door-gothic", 1, 0.44, 0),
        at("d3", "door", "door-gothic", 3, 0.56, 0),
        at("a1", "window", "window-arrow-slit", 1, 0.68, 1.6),
        at("a2", "window", "window-arrow-slit", 2, 0.78, 1),
        at("a3", "window", "window-arrow-slit", 3, 0.9, 0.8)
      ] as never
    };
  };
  it.each([
    ["rectangular house", withFacade({ id: "a", height: 5, rectangle: { center: [0, 0], size: [8, 6], rotation: 0 } })],
    [
      "gothic and arrow, square",
      withStone({ id: "s", height: 5, rectangle: { center: [0, 0], size: [10, 10], rotation: 0 } })
    ],
    ["gothic and arrow, round", withStone({ id: "t", height: 5, circle: { center: [0, 0], radius: 6 } })],
    ["round house", withFacade({ id: "c", height: 5, circle: { center: [0, 0], radius: 4 } })],
    ["rotated house", withFacade({ id: "r", height: 7, rectangle: { center: [1, 2], size: [10, 7], rotation: 0.6 } })]
  ] as [string, CoreHouseParameters][])(
    "%s: the same prefab meshes and wall openings",
    (name, p) => {
      const online = PREFAB_ONLINE[name];
      const result = designBuildingCore(buildCoreHouse(p), registry, {
        environment: coreBuildingEnvironment(flat, nativeAssets.compilation)
      });
      expect(result.diagnostics).toEqual([]);
      const parts = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), nativeAssets.compilation).flatMap(
        (d) => d.parts
      );
      const byId = new Map(online.parts.map((x) => [x.id, x]));
      expect(parts.map((x) => x.id).sort()).toEqual([...byId.keys()].sort());
      const deviation = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
      for (const x of parts) {
        const o = byId.get(x.id)!;
        const ours = meshPrint(x);
        expect(ours.floats).toBe(o.floats);
        // Prefabs are resized about their back, online about their origin with a fixed
        // standing distance: the two differ across the wall by up to a few centimetres.
        const off = printDeviation(ours, o);
        expect(off.position).toBeLessThan(0.03);
        expect(off.normal).toBeLessThan(0.03);
        expect(off.uv).toBeLessThan(1e-3);
        expect(digest(x.colors)).toBe(o.colors);
        expect(digest(x.emission)).toBe(o.emission);
        expect(digest(x.appearance!.kinds)).toBe(o.kinds);
        expect(digest(x.appearance!.colorIds)).toBe(o.colorIds);
      }
      // Each opening is an online hole and comes out of a wall. Online centers a hole on
      // the model origin, not on its collision box; on doors that is 1 cm lower. Online sizes
      // a Gothic window by its full hat, which it draws on timber walls only; the prefab by
      // the hat it draws, which is 1 % narrower.
      const holes = online.holes;
      const walls = result.parts.filter((x) => x.type === "wall");
      const mounted = result.parts.filter(
        (x) => x.identity.kind === "author" && holes.some((h) => h.decorationId === (x.identity as { id: string }).id)
      );
      expect(mounted).toHaveLength(new Set(holes.map((h) => h.decorationId)).size);
      const rows = walls.flatMap((w) => {
        const face = w.original.elements.face;
        const offset = face.kind === "surface" ? ((face.surface.params as { uOffset?: number }).uOffset ?? 0) : 0;
        return w.modifications.flatMap((mod) =>
          mod.op === "removeArea" ? [[mod.rect[0] + offset, mod.rect[1], mod.rect[2] + offset, mod.rect[3]]] : []
        );
      });
      for (const m of mounted) {
        const own = holes.filter((h) => m.identity.kind === "author" && h.decorationId === m.identity.id);
        const middle = own[0].centerU;
        // The openings come from the prefab's occupied space, a few rows round the online holes.
        const near = rows.filter(
          (r) =>
            Math.abs((r[0] + r[2]) / 2 - middle) < own[0].width &&
            r[1] < Math.max(...own.map((h) => h.centerY + h.height / 2))
        );
        expect(near.length).toBeGreaterThan(0);
        expect(near.length).toBeLessThanOrEqual(4);
        const widest = near.reduce((x, y) => (y[2] - y[0] > x[2] - x[0] ? y : x));
        const hole = own.reduce((x, y) => (y.width > x.width ? y : x));
        expect(Math.abs((widest[0] + widest[2]) / 2 - middle)).toBeLessThan(0.02);
        expect(Math.abs(widest[2] - widest[0] - hole.width)).toBeLessThan(0.1);
        const bottom = Math.min(...own.map((h) => h.centerY - h.height / 2)),
          top = Math.max(...own.map((h) => h.centerY + h.height / 2));
        expect(Math.abs(Math.min(...near.map((r) => r[1])) - bottom)).toBeLessThan(0.1);
        expect(Math.abs(Math.max(...near.map((r) => r[3])) - top)).toBeLessThan(0.1);
      }
      // Stone hats: the same unit, placed the same way, with bones within 3 cm.
      const coreStones = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), nativeAssets.compilation)
        .flatMap((d) => d.stones)
        .sort((a, b) => a.id.localeCompare(b.id));
      const onlineStones = online.stones;
      expect(coreStones.map((x) => x.template)).toEqual(onlineStones.map((x) => x.template));
      coreStones.forEach((x, i) => {
        const o = onlineStones[i];
        expect(x.instance.flags).toBe(o.flags);
        // A rigid hat is placed by its pose; a bent one by its bones. Online narrows a bent hat
        // by another 5 cm on round walls.
        if (x.instance.flags & 4) expect(deviation([...x.instance.xform.slice(9)], o.position)).toBeLessThan(0.01);
        else
          x.instance.bones.forEach((bone, k) => {
            expect(deviation([...bone.position], o.bones[k].position)).toBeLessThan(0.03);
            expect(deviation([...bone.normalXZ], o.bones[k].normalXZ)).toBeLessThan(0.05);
          });
      });
    },
    60000
  );
});

type FrozenPart = MeshPrint & { id: string; colors: string; kinds?: string; emission?: string };
/** Online's roof prefabs: Gothic dormers (which it rejected, its small-roof tile count, its
 * parts), Cottage dormers (its shed strips and parts) and deck prefabs (its parts). */
const ROOF_ONLINE = frozen<{
  dormers: Record<string, { rejected: string[]; tiles: number; parts: FrozenPart[] }>;
  cottage: Record<string, { diagnostics: number; strips: number; parts: FrozenPart[] }>;
  deck: Record<string, { diagnostics: number; parts: FrozenPart[] }>;
}>("CoreBuilding-roofPrefabs");
/** The positions of a fingerprint, flattened: center, bounds and the samples. */
const printPoints = (m: MeshPrint) => [m.center, m.min, m.max, ...m.samples.map((x) => x.position)];
describe("Roof dormers against the online path", () => {
  const sized = (rank: 1 | 2 | 3) => {
    const [width, height] = decorationSize("dormer-gothic", rank).installationSize;
    return { width, height };
  };
  const withDormers = (house: CoreHouseParameters, at: [number, number, 1 | 2 | 3][]): CoreHouseParameters => ({
    ...house,
    roofAttachments: at.map(([u, v, rank], i) => ({
      id: "d" + i,
      type: "dormer-gothic" as const,
      rank,
      uv: [u, v] as [number, number],
      bottom: 0,
      ...sized(rank)
    }))
  });
  it.each([
    [
      "hip roof",
      withDormers(
        { id: "h", height: 4, rectangle: { center: [0, 0], size: [10, 8], rotation: 0 }, roof: { height: 0.6 } },
        [
          [0.25, 0.2, 1],
          [0.55, 0.2, 2],
          [0.5, 0.82, 3]
        ]
      )
    ],
    [
      "gable roof, turned",
      withDormers(
        {
          id: "g",
          height: 4,
          rectangle: { center: [0, 0], size: [9, 7], rotation: 0.4 },
          roof: { height: 0.55, ridge_length: 1 }
        },
        [
          [0.3, 0.25, 2],
          [0.7, 0.14, 1]
        ]
      )
    ],
    [
      "round roof of the built-in presets",
      withDormers(
        {
          id: "r",
          seed: 1,
          height: 3.125,
          circle: { center: [0, 0], radius: 2.4, phase: 0 },
          roof: { tip: [0, 0], profile: 0, height: 0.35, ridge_length: 0.6, eave: 0.3, ridge_direction: 0, flat_rim: 0 }
        },
        [[0.012081486496702987, 0.6565982408069662, 2]]
      )
    ]
  ] as [string, CoreHouseParameters][])(
    "%s: the same window meshes, a small roof of the same tiles, and a footprint",
    (name, p) => {
      const online = ROOF_ONLINE.dormers[name];
      // Online also asks for clearance under the roof's top; the core only asks that the
      // dormer's roof meets its slope, so it lays the dormers online turns away.
      const rejected = new Set(online.rejected);
      const result = designBuildingCore(buildCoreHouse(p), registry, {
        environment: coreBuildingEnvironment(flat, nativeAssets.compilation)
      });
      expect(result.diagnostics).toEqual([]);
      const environment = coreBuildingEnvironment(flat, nativeAssets.compilation);
      expect(
        result.parts.filter((x) => x.type === "dormer").every((x) => expandUnits(x, registry, { environment }).length)
      ).toBe(true);
      const parts = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), nativeAssets.compilation)
        .flatMap((d) => d.parts)
        .filter((x) => !rejected.has(x.id.split("/").slice(1, 3).join("/")));
      const byId = new Map(online.parts.map((x) => [x.id, x]));
      expect(parts.map((x) => x.id).sort()).toEqual([...byId.keys()].sort());
      expect(parts.length).toBeGreaterThan(0);
      for (const x of parts) {
        const o = byId.get(x.id)!;
        const ours = meshPrint(x);
        expect(ours.floats).toBe(o.floats);
        // Across the plan the window stands where online puts it. Upright it stands on the core
        // roof's covering; the two roofs' surfaces differ by up to 0.13 m there.
        const dy = ours.samples[0].position[1] - o.samples[0].position[1];
        expect(Math.abs(dy)).toBeLessThan(0.25);
        const theirs = printPoints(o);
        printPoints(ours).forEach((q, i) => {
          expect(Math.abs(q[0] - theirs[i][0])).toBeLessThan(0.03);
          expect(Math.abs(q[1] - theirs[i][1] - dy)).toBeLessThan(1e-4);
          expect(Math.abs(q[2] - theirs[i][2])).toBeLessThan(0.03);
        });
        expect(digest(x.colors)).toBe(o.colors);
        expect(digest(x.appearance!.kinds)).toBe(o.kinds);
      }
      // The small roofs: the same rows of tiles over the arch and ridge caps along the peak,
      // within a third of online's count (the core roof meets its own slope).
      const onlineTiles = online.tiles;
      const coreTiles = result.parts
        .filter((x) => x.type === "dormerRoof" || x.type === "dormerRidge")
        .filter((x) => {
          const owner = result.connections.find(
            (c) => x.identity.kind === "derived" && c.key === x.identity.connection
          )!;
          return !rejected.has(JSON.parse(owner.guest!)[1]);
        })
        .reduce((n, x) => n + expandUnits(x, registry, { environment }).length, 0);
      expect(Math.abs(coreTiles - onlineTiles) / onlineTiles).toBeLessThan(0.35);
      // Each dormer takes its footprint out of the roof part it stands on.
      for (const d of result.parts.filter((x) => x.type === "dormer")) {
        const connection = result.connections.find((c) => c.guest === d.key)!;
        const mount = d.original.elements.mount;
        if (mount.kind !== "point" || !mount.on) throw Error("A dormer mount names its roof");
        const host = result.parts.find((x) => x.key === connection.hosts[mount.on!.host])!;
        expect(host.modifications.some((m) => m.op === "removeArea")).toBe(true);
      }
    },
    60000
  );
});

describe("Cottage dormers against the online path", () => {
  it.each([1, 2] as const)(
    "rank %s: the same window bodies under a shed of the same pieces",
    (rank) => {
      const [width, height] = decorationSize("dormer-cottage", rank).installationSize;
      const a: CoreRoofAttachment = {
        id: "c",
        type: "dormer-cottage",
        rank,
        uv: [0.45, 0.2],
        bottom: 0,
        width,
        height
      };
      const p: CoreHouseParameters = {
        id: "h",
        height: 4,
        rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
        roof: { height: 0.6 },
        roofAttachments: [a]
      };
      const online = ROOF_ONLINE.cottage[`rank ${rank}`];
      expect(online.diagnostics).toBe(0);
      const environment = coreBuildingEnvironment(flat, nativeAssets.compilation);
      const result = designBuildingCore(buildCoreHouse(p), registry, { environment });
      expect(result.diagnostics).toEqual([]);
      const parts = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), nativeAssets.compilation).flatMap(
        (d) => d.parts
      );
      // Online numbers the members of every Cottage dormer; the core numbers them when a part
      // lays more than one body.
      const byId = new Map(online.parts.map((x) => [x.id, x]));
      expect(parts.map((x) => x.id).sort()).toEqual([...byId.keys()].sort());
      for (const x of parts) {
        const o = byId.get(x.id)!;
        const ours = meshPrint(x);
        expect(ours.floats).toBe(o.floats);
        // Across the plan the bodies stand where online puts them. Online sets a row of bodies on
        // its roof's section, 0.19 m behind where it sets one body; the core stands every body on
        // its covering, which lies lower than online's roof.
        const dy = ours.samples[0].position[1] - o.samples[0].position[1];
        expect(Math.abs(dy)).toBeLessThan(0.25);
        const theirs = printPoints(o);
        printPoints(ours).forEach((q, i) => {
          expect(Math.abs(q[0] - theirs[i][0])).toBeLessThan(0.03);
          expect(Math.abs(q[2] - theirs[i][2])).toBeLessThan(rank === 1 ? 0.03 : 0.2);
        });
        expect(digest(x.colors)).toBe(o.colors);
      }
      // The shed: tiles, a soffit, trims and cheeks, about as many pieces as online's.
      const shed = result.parts.find((x) => x.type === "shedRoof")!;
      const pieces = expandUnits(shed, registry, { environment });
      expect(Math.abs(pieces.length - online.strips) / online.strips).toBeLessThan(0.25);
      for (const role of ["soffit", "trim", "cheek"]) expect(pieces.some((u) => u.key.startsWith(role))).toBe(true);
    },
    60000
  );
});

describe("Flat roof prefabs against the online path", () => {
  const at = (id: string, type: CoreRoofAttachment["type"], uv: [number, number]): CoreRoofAttachment => {
    const [width, height] = decorationSize(type, 1).installationSize;
    return { id, type, rank: 1, uv, bottom: 0, width, height };
  };
  it.each([
    [
      "square deck",
      {
        id: "f",
        height: 4,
        rectangle: { center: [1, 2], size: [9, 7], rotation: 0.4 },
        roof: { height: 0 },
        roofUnit: "roof_tile",
        roofAttachments: [
          at("h1", "hatch-cottage", [0.3, 0.4]),
          at("h2", "hatch-gothic", [0.7, 0.7]),
          at("l1", "roof-lantern", [0.75, 0.25])
        ]
      }
    ],
    [
      "round deck",
      {
        id: "c",
        height: 5,
        circle: { center: [0, 0], radius: 4, phase: 0.3 },
        roof: { height: 0 },
        roofUnit: "roof_tile",
        roofAttachments: [at("h1", "hatch-cottage", [0.4, 0.55]), at("l1", "roof-lantern", [0.6, 0.3])]
      }
    ]
  ] as [string, CoreHouseParameters][])(
    "%s: the same hatch and lantern meshes, and the hatch opens the deck",
    async (name, p) => {
      const online = ROOF_ONLINE.deck[name];
      expect(online.diagnostics).toBe(0);
      const result = designBuildingCore(buildCoreHouse(p), registry, {
        environment: coreBuildingEnvironment(flat, nativeAssets.compilation)
      });
      expect(result.diagnostics).toEqual([]);
      const parts = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), nativeAssets.compilation).flatMap(
        (d) => d.parts
      );
      const byId = new Map(online.parts.map((x) => [x.id, x]));
      expect(parts.map((x) => x.id).sort()).toEqual([...byId.keys()].sort());
      for (const x of parts) {
        const o = byId.get(x.id)!;
        const ours = meshPrint(x);
        expect(ours.floats).toBe(o.floats);
        // Online places a deck prefab by its origin on the deck, as the core does.
        const off = printDeviation(ours, o);
        expect(off.position).toBeLessThan(1e-5);
        expect(off.normal).toBeLessThan(1e-5);
        expect(digest(x.colors)).toBe(o.colors);
        expect(digest(x.emission)).toBe(o.emission);
      }
      // A hatch takes its opening out of the deck; the renderer cuts the deck there.
      const deck = result.parts.find((x) => x.type === "roofDeck")!;
      expect(deck.modifications.filter((m) => m.op === "removeArea")).toHaveLength(
        p.roofAttachments!.filter((a) => a.type !== "roof-lantern").length
      );
      const { renderInput } = await compileCoreBuilding(result, registry, {
        environment: { ground: flat },
        assets: nativeAssets.compilation
      });
      expect(renderInput.groups.find((g) => g.role === "platform")!.roofApertures).toBe(true);
      expect(renderInput.dormerBins.report.inputCount).toBeGreaterThan(0);
    },
    60000
  );
});

describe("Editing the core placement document", () => {
  it("hides the units whose anchors fall in a region and repaints others", async () => {
    const { renderInput } = await compileCoreBuilding(core({ id: "a" }), registry, {
      environment,
      assets: nativeAssets
    });
    const built = pack(renderInput);
    const document = structuredClone(renderInput.placementDocument);
    // Hide wall bricks in the first two metres of the perimeter, below 1.5 m.
    const hide = [
      [0, 0],
      [2, 0],
      [2, 1.5],
      [0, 1.5]
    ];
    // Repaint the roof tiles over the plan's positive x half as bricks.
    const paint = [
      [0.013, -10],
      [10, -10],
      [10, 10],
      [0.013, 10]
    ];
    document.overrides = [
      { id: "hide", binding_id: "a-wall", region: { space: "surface_uv", polygon: hide }, effect: { hidden: true } },
      {
        id: "paint",
        binding_id: "a-roof",
        region: { space: "surface_uv", polygon: paint },
        effect: { unit_id: "brick" }
      }
    ];
    const resolved = resolveDocument(built, document);
    const inside = (poly: number[][], [x, y]: number[]) =>
      x > poly[0][0] && x < poly[1][0] && y > poly[0][1] && y < poly[2][1];
    const walls = resolved.cells.filter((c: { binding_id: string }) => c.binding_id === "a-wall");
    const hidden = walls.filter((c: { hidden: boolean }) => c.hidden);
    expect(hidden.length).toBeGreaterThan(5);
    for (const c of walls) expect(c.hidden).toBe(inside(hide, c.anchor_uv));
    // Tiles follow the region; eave closures follow the tile above them.
    const layoutIds = new Set(
      renderInput.groups.find((g) => g.binding_id === "a-roof" && g.role === "layout")!.cells.map((c) => c.id)
    );
    const roof = resolved.cells.filter((c: { id: string }) => layoutIds.has(c.id));
    const painted = roof.filter((c: { unit_id: string }) => c.unit_id === "brick");
    expect(painted.length).toBeGreaterThan(50);
    for (const c of roof) expect(c.unit_id).toBe(inside(paint, c.anchor_uv) ? "brick" : "roof_tile");
    // The selections show each cell in its own material's draw.
    const layout = renderInput.groups.find((g) => g.binding_id === "a-roof" && g.role === "layout")!;
    const selection = resolved.selections.find((s: { group: number }) => s.group === layout.id)!;
    expect(selection.selections.brick.length + selection.selections.roof_tile.length).toBe(layout.cells.length);
  }, 60000);
});
