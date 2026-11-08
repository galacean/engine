vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import {
  compileCoreBuilding,
  coreBuildingDecorations,
  coreBuildingGrounding,
  coreBuildingLayout,
  prepareCoreBuilding
} from "../../src/building/render/CoreBuilding";
import { European } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "../../src/building/parts/architecture/BuildingImplementation";
import {
  buildingPreviewInput,
  prepareBuildingPublication
} from "../../src/building/parts/architecture/BuildingPublication";
import { buildingPalette } from "../../src/building/parts/architecture/BuildingPalette";
import { buildingGrounding } from "../../src/building/parts/architecture/BuildingGrounding";
import { profilePreview } from "../../src/building/runtime/ProfilePreview";
import { ConstructionSurfaceQuery } from "../../src/building/runtime/ConstructionSurfaceQuery";
import { buildBuildingRenderPackage } from "../../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../src/building/runtime/BuildingGlobals";
import { resolveDocument } from "../../src/building/runtime/PlacementDocument.js";
import { planFacadeDecorations, normalizeDecorationPlan } from "../../src/building/runtime/DecorationPlan";
import { normalizeProfileRoof } from "../../src/building/runtime/ProfileParameters";
import { isFlatRoofHeight } from "../../src/building/runtime/RoofMode";
import type { WallOpeningParams } from "../../src/building/partTypes/Openings";

// Acceptance of the core render path against the online path, house by house.
const flat = () => 0;
const registry = registerHouseTypes(createBuildingRegistry());
const environment = { ground: flat };
const HOUSES: [string, CoreHouseParameters][] = [
  ["hip roof", { id: "a" }],
  ["gable roof", { id: "g", roof: { ridge_length: 1 } }],
  ["steep roof", { id: "s", roof: { height: 0.8 } }],
  ["rotated house", { id: "r", rectangle: { center: [1, 2], size: [10, 7], rotation: 0.6 } }],
  ["flat roof", { id: "f", roof: { height: 0 } }],
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
async function online(p: CoreHouseParameters) {
  const design = designBuilding(European.buildHouses(p as never) as never, flat as never, nativeAssets);
  const publication = await prepareBuildingPublication(design);
  const preview = profilePreview(buildingPreviewInput(design, publication), flat as never, {
    assets: nativeAssets,
    includeStructure: true,
    includeAppearance: true
  });
  return { design, preview };
}
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
    async (_name, p) => {
      const a = await online(p);
      const b = prepareCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const qa = new ConstructionSurfaceQuery(a.preview.structuralParts!, [0, 0, 0], (id) => id);
      const qb = new ConstructionSurfaceQuery(b.preview.structuralParts!, [0, 0, 0], (id) => id);
      const [cx, cz] = p.rectangle?.center ?? [0, 0];
      const flatRoof = p.roof?.height === 0;
      let rays = 0;
      for (const y of [1, 2.5, 3.6, 5, 6.5])
        for (let k = 0; k < 16; k++) {
          const angle = (k / 16) * 2 * Math.PI;
          const start: [number, number, number] = [cx + 20 * Math.cos(angle), y + 6, cz + 20 * Math.sin(angle)];
          const ha = qa.intersectSegment(start, [cx, y, cz]),
            hb = qb.intersectSegment(start, [cx, y, cz]);
          expect(!!hb).toBe(!!ha);
          if (!ha || !hb) continue;
          // The online structure treats a parapet as a solid band; the core keeps its crenels.
          if (flatRoof && ha.position[1] > 2.85 - 1e-6) continue;
          expect(Math.hypot(...ha.position.map((v, i) => v - hb.position[i]))).toBeLessThan(0.1);
          rays++;
        }
      expect(rays).toBeGreaterThan(flatRoof ? 12 : 30);
    },
    60000
  );

  it.each(HOUSES)(
    "%s: same palette, similar bounds and distance appearance",
    async (_name, p) => {
      const a = await online(p);
      const b = prepareCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const palette = buildingPalette(a.design);
      expect(b.appearance.paletteSlots).toEqual(palette.paletteSlots.map((s) => expect.objectContaining(s)));
      expect(b.appearance.colorOwners.map((o) => o.id)).toEqual(palette.colorOwners.map((o) => o.id));
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(b.preview.bounds.min[k] - a.preview.bounds.min[k])).toBeLessThan(0.3);
        expect(Math.abs(b.preview.bounds.max[k] - a.preview.bounds.max[k])).toBeLessThan(0.3);
      }
      // Units standing out of the walls stay solid at a distance, about as many as online.
      const retained = (v: { retainedWallUnits: { cells: unknown[] }[] }) =>
        v.retainedWallUnits.reduce((n, r) => n + r.cells.length, 0);
      expect(Math.abs(retained(b.preview) - retained(a.preview))).toBeLessThanOrEqual(
        Math.max(4, 0.35 * retained(a.preview))
      );
      // Every textured surface online has a textured core counterpart.
      for (const material of ["brick", "roof_tile"] as const) {
        const ia = a.preview.parts.find((x) => x.material === material && x.lodAppearance);
        const ib = b.preview.parts.find((x) => x.material === material && x.lodAppearance);
        expect(!!ib).toBe(!!ia);
        // The core surface is covered at least as well as the online one.
        if (ia && ib) expect(coverage(ib)).toBeGreaterThan(coverage(ia) - 0.1);
      }
    },
    60000
  );

  it.each(HOUSES)(
    "%s: same grounding supports and similar bounds",
    async (_name, p) => {
      const implemented = await implementBuilding(
        designBuilding(European.buildHouses(p as never) as never, flat as never, nativeAssets)
      );
      const ground = { grounding: { originY: 0, renderPosition: [0, 0, 0] as [number, number, number] }, height: flat };
      const ga = buildingGrounding(implemented as never, ground as never);
      const prepared = prepareCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const gb = coreBuildingGrounding(prepared.layout, prepared.preview, ground);
      expect(gb.supports!.map((s) => s.id)).toEqual(ga.supports!.map((s) => s.id));
      for (const [sa, sb] of ga.supports!.map((s, i) => [s, gb.supports![i]] as const)) {
        expect(sb.minGround).toBeCloseTo(sa.minGround, 6);
        expect(sb.maxGround).toBeCloseTo(sa.maxGround, 6);
        expect(sb.topY).toBeCloseTo(sa.topY, 6);
      }
      expect(gb.minWorldHeight).toBeCloseTo(ga.minWorldHeight!, 6);
      expect(gb.maxWorldHeight).toBeCloseTo(ga.maxWorldHeight!, 6);
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(gb.localBounds!.min[k] - ga.localBounds!.min[k])).toBeLessThan(0.6);
        expect(Math.abs(gb.localBounds!.max[k] - ga.localBounds!.max[k])).toBeLessThan(0.6);
      }
      expect(gb.contacts!.belowTerrain).toBeLessThan(1e-9);
    },
    60000
  );

  it.each(HOUSES)(
    "%s: the resident package has the same draws and similar unit counts",
    async (_name, p) => {
      const a = (
        await implementBuilding(designBuilding(European.buildHouses(p as never) as never, flat as never, nativeAssets))
      ).renderInput;
      const { renderInput: b } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const pa = pack(a),
        pb = pack(b);
      expect(pb.draws.length).toBe(pa.draws.length);
      const units = (input: typeof a) => input.groups.reduce((n, g) => n + g.cells.length, 0);
      expect(Math.abs(units(b) - units(a)) / units(a)).toBeLessThan(0.12);
      expect(b.backingParts.length).toBe(a.backingParts.length);
    },
    60000
  );
});

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
    async (_name, p) => {
      const a = (
        await implementBuilding(designBuilding(European.buildHouses(p as never) as never, flat as never, nativeAssets))
      ).renderInput;
      const { renderInput: b } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const bands = (input: typeof a) => input.groups.filter((g) => g.role === "floor-band").flatMap((g) => g.cells);
      const [ba, bb] = [bands(a), bands(b)];
      expect(bb.length).toBe(ba.length);
      const levels = (cells: typeof ba) => [...new Set(cells.map((c) => c.center[1].toFixed(3)))].sort();
      expect(levels(bb)).toEqual(levels(ba));
      for (const c of bb) {
        expect(c.size[1]).toBeCloseTo(ba[0].size[1], 6);
        expect(c.size[2]).toBeCloseTo(ba[0].size[2], 6);
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
    async (_name, p) => {
      const a = (
        await implementBuilding(designBuilding(European.buildHouses(p as never) as never, flat as never, nativeAssets))
      ).renderInput;
      const { renderInput: b } = await compileCoreBuilding(core(p), registry, { environment, assets: nativeAssets });
      const pa = a.surfaceParts.filter((x) => x.plaster),
        pb = b.surfaceParts.filter((x) => x.plaster);
      expect(pb.length).toBeGreaterThan(0);
      const [sa, sb] = [pa.reduce((n, x) => n + area(x), 0), pb.reduce((n, x) => n + area(x), 0)];
      expect(Math.abs(sb - sa) / sa).toBeLessThan(0.05);
      for (const x of pb) {
        expect(x.plaster!.wear).toBeCloseTo(pa[0].plaster!.wear, 6);
        expect(x.plaster!.color).toBe(pa[0].plaster!.color);
        expect(x.plaster!.wallLength).toBeCloseTo(pa[0].plaster!.wallLength, 4);
        expect(x.plaster!.edgeDistances.length).toBe(x.uvs.length);
        expect(x.normals!.length).toBe(x.positions.length);
      }
      // The finish is drawn, not backed.
      expect(b.backingParts.some((x) => x.plaster)).toBe(false);
    },
    60000
  );
});

describe("Wall prefabs against the online path", () => {
  /** The facade the initial village plans for a house: windows, a door and a wall lamp. */
  const withFacade = (house: CoreHouseParameters): CoreHouseParameters => {
    const roof = normalizeProfileRoof(house.roof ?? {});
    const planned = planFacadeDecorations({ ...house, roof, wallStructure: "masonry" } as never);
    return { ...house, attachments: normalizeDecorationPlan(planned, isFlatRoofHeight(roof.height)) as never };
  };
  it.each([
    ["rectangular house", withFacade({ id: "a", height: 5, rectangle: { center: [0, 0], size: [8, 6], rotation: 0 } })],
    ["round house", withFacade({ id: "c", height: 5, circle: { center: [0, 0], radius: 4 } })],
    ["rotated house", withFacade({ id: "r", height: 7, rectangle: { center: [1, 2], size: [10, 7], rotation: 0.6 } })]
  ] as [string, CoreHouseParameters][])(
    "%s: the same prefab meshes and wall openings",
    async (_name, p) => {
      const design = designBuilding(European.buildHouses(p as never) as never, flat as never, nativeAssets.compilation);
      const online = profilePreview(
        buildingPreviewInput(design, await prepareBuildingPublication(design)),
        flat as never,
        {
          assets: nativeAssets.compilation,
          retainDecorationParts: true
        } as never
      );
      const result = designBuildingCore(buildCoreHouse(p, nativeAssets.compilation), registry, { environment });
      expect(result.diagnostics).toEqual([]);
      const parts = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), nativeAssets.compilation).flatMap(
        (d) => d.parts
      );
      // Online part ids repeat the house id: the attachment ids it gives carry it already.
      const byId = new Map(online.decorationParts.map((x) => [x.id.replace(/^[^/]+\//, ""), x]));
      expect(parts.map((x) => x.id).sort()).toEqual([...byId.keys()].sort());
      const deviation = (a: number[], b: number[]) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0);
      for (const x of parts) {
        const o = byId.get(x.id)!;
        expect(x.positions.length).toBe(o.positions.length);
        // Prefabs are resized about their back, online about their origin with a fixed
        // standing distance: the two differ across the wall by up to a few centimetres.
        expect(deviation(x.positions, o.positions)).toBeLessThan(0.03);
        expect(deviation(x.normals, o.normals)).toBeLessThan(0.03);
        expect(deviation(x.uvs!.flat(), o.uvs!.flat())).toBeLessThan(1e-4);
        expect(x.colors).toEqual(o.colors);
        expect(x.emission).toEqual(o.emission);
        expect(x.appearance!.kinds).toEqual(o.appearance!.kinds);
        expect(x.appearance!.colorIds).toEqual(o.appearance!.colorIds);
      }
      // Each opening is the online hole and comes out of a wall. Online centers a hole on
      // the model origin, not on its collision box; on doors that is 1 cm lower.
      const holes = design.prepared.decorations.flatMap((d) => d.holes);
      const walls = result.parts.filter((x) => x.type === "wall");
      const mounted = result.parts.filter((x) => x.original.elements.opening);
      expect(mounted.length).toBe(holes.length);
      for (const m of mounted) {
        const opening = m.original.elements.opening as { surface: { params: WallOpeningParams } };
        const [u0, v0, u1, v1] = opening.surface.params.perimeter;
        const hole = holes.find((h) => m.identity.kind === "author" && h.decorationId === m.identity.id)!;
        expect(hole).toBeDefined();
        expect((u0 + u1) / 2).toBeCloseTo(hole.centerU, 3);
        expect(u1 - u0).toBeCloseTo(hole.width, 3);
        expect(v1 - v0).toBeCloseTo(hole.height, 3);
        expect(Math.abs((v0 + v1) / 2 - hole.centerY)).toBeLessThan(0.015);
        const rect = opening.surface.params.rect;
        expect(
          walls.some((w) =>
            w.modifications.some((mod) => mod.op === "removeArea" && mod.rect.every((v, i) => v === rect[i]))
          )
        ).toBe(true);
      }
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
