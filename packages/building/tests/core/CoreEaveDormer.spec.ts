// Eave dormers: wall windows that break through the eave and carry a small roof out of it.
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
  type ResolvedPart
} from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  buildCoreHouses,
  type CoreHouseParameters,
  type CoreWallAttachment
} from "../../src/building/application/CoreEuropean";
import { European } from "../../src/building/application/European";
import {
  compileCoreBuilding,
  coreBuildingDecorations,
  coreBuildingEnvironment,
  coreBuildingLayout
} from "../../src/building/render/CoreBuilding";
import { European as OnlineEuropean } from "../../src/building/parts/architecture/European";
import { designBuilding } from "../../src/building/parts/architecture/BuildingDesign";
import {
  buildingPreviewInput,
  prepareBuildingPublication
} from "../../src/building/parts/architecture/BuildingPublication";
import { profilePreview } from "../../src/building/runtime/ProfilePreview";
import { constructionDecorationType } from "../../src/building/runtime/ConstructionDecorationCatalog";
import { MOUNTED_PART_TYPES } from "../../src/building/partTypes";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const assets = nativeAssets.compilation;
const environment = coreBuildingEnvironment(flat, assets);
const design = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
const lay = (part: ResolvedPart) => expandUnits(part, registry, { environment });
const square = { center: [0, 0] as [number, number], size: [10, 10] as [number, number], rotation: 0 };
const at = (type: string, rank: 1 | 2 | 3, u: number, extra: Partial<CoreWallAttachment> = {}): CoreWallAttachment => {
  const size = constructionDecorationType(assets.decorations, type)!.dimensions.find((d) => d.rank === rank)!;
  return {
    id: `${type}-${rank}`,
    kind: "window",
    type,
    rank,
    u,
    bottom: 4 - size.height * 0.6,
    width: size.width,
    height: size.height,
    ...extra
  };
};
const house = (attachments: CoreWallAttachment[], extra: Partial<CoreHouseParameters> = {}): CoreHouseParameters => ({
  id: "h",
  seed: 12345,
  height: 4,
  rectangle: square,
  attachments,
  ...extra
});
const messages = (r: ReturnType<typeof design>) => r.diagnostics.map((d) => d.message);
const online = async (p: CoreHouseParameters) => {
  const planned = designBuilding(OnlineEuropean.buildHouses(p as never) as never, flat as never, assets);
  return profilePreview(
    buildingPreviewInput(planned, await prepareBuildingPublication(planned)),
    flat as never,
    {
      assets,
      retainDecorationParts: true
    } as never
  );
};
const center = (positions: number[]) => {
  const out = [0, 0, 0];
  for (let i = 0; i < positions.length; i++) out[i % 3] += positions[i] / (positions.length / 3);
  return out;
};

describe("Eave dormers against the online path", () => {
  it.each([
    ["Cottage 1", at("dormer-cottage-half", 1, 0.125)],
    ["Cottage 3", at("dormer-cottage-half", 3, 0.125)],
    ["Gothic 1", at("dormer-gothic-half", 1, 0.125)],
    ["Gothic 2", at("dormer-gothic-half", 2, 0.125)],
    ["Gothic 3", at("dormer-gothic-half", 3, 0.125)],
    ["arrow slit 2", at("dormer-arrow-slit-half", 2, 0.125)],
    ["arrow slit 3", at("dormer-arrow-slit-half", 3, 0.125)]
  ] as [string, CoreWallAttachment][])("%s: the same meshes at the same place", async (_name, a) => {
    const p = house([a]);
    const result = design(p);
    expect(result.diagnostics).toEqual([]);
    const ours = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), assets).flatMap((d) => d.parts);
    const theirs = (await online(p)).decorationParts;
    expect(ours.map((x) => x.id).sort()).toEqual(theirs.map((x) => x.id).sort());
    for (const x of ours) {
      const o = theirs.find((y) => y.id === x.id)!;
      expect(x.positions.length).toBe(o.positions.length);
      const [c, d] = [center(x.positions), center(o.positions)];
      for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - d[k])).toBeLessThan(0.03);
    }
  });

  it("opens the wall and the eave, and carries a shed", () => {
    const result = design(house([at("dormer-cottage-half", 1, 0.125)]));
    const wall = result.parts.filter((p) => p.type === "wall" && p.modifications.some((m) => m.op === "removeArea"));
    expect(wall).toHaveLength(1);
    const roofs = result.parts.filter((p) => p.type === "roof" && p.modifications.some((m) => m.op === "removeArea"));
    expect(roofs).toHaveLength(1);
    // The opening is a stack of bands that reaches the roof's lower edge.
    const starts = roofs[0].modifications.flatMap((m) => (m.op === "removeArea" ? [m.rect[1]] : []));
    expect(Math.min(...starts)).toBe(0);
    const shed = result.parts.find((p) => p.type === "shedRoof")!;
    expect(lay(shed).length).toBeGreaterThanOrEqual(8);
    // The opening ends under the shed: no hole opens in the roof behind it.
    const loft = shed.original.elements.shed;
    const mount = result.parts.find((p) => p.type === "eaveDormer")!.original.elements.mount;
    if (loft?.kind !== "surface" || mount.kind !== "point") throw Error("no shed");
    const rows = (loft.surface.params as { rows: { points: number[][] }[] }).rows;
    const inward = (q: readonly number[]) =>
      -((q[0] - mount.frame.origin[0]) * mount.frame.z[0] + (q[2] - mount.frame.origin[2]) * mount.frame.z[2]);
    const surface = new EffectiveGeometry(roofs[0].original, roofs[0].modifications, registry.surfaces).surface(
      "slope"
    );
    for (const m of roofs[0].modifications) {
      if (m.op !== "removeArea") continue;
      const top = surface.frame((m.rect[0] + m.rect[2]) / 2, m.rect[3]).origin;
      expect(inward(top)).toBeLessThan(inward(rows[rows.length - 1].points[4]) + 0.1);
    }
    const connection = result.connections.find((c) => c.rule === "eaveDormerOnHouse")!;
    expect(shed.identity).toMatchObject({ kind: "derived", connection: connection.key });
  });

  it("carries an arch cut off at the wall top, with a ridge", () => {
    const result = design(house([at("dormer-gothic-half", 2, 0.125)]));
    expect(result.diagnostics).toEqual([]);
    const part = result.parts.find((p) => p.type === "eaveDormer")!;
    const sweep = part.original.elements.sweep;
    if (sweep?.kind !== "surface") throw Error("no sweep");
    const params = sweep.surface.params as { outline: number[][]; origin: number[]; depth: number };
    expect(params.origin[1] + params.outline[0][1]).toBeCloseTo(4, 0);
    expect(params.depth).toBeGreaterThan(0.3);
    expect(lay(result.parts.find((p) => p.type === "dormerRoof")!).length).toBeGreaterThan(6);
    expect(lay(result.parts.find((p) => p.type === "dormerRidge")!).length).toBeGreaterThan(0);
  });

  it("has shutters on rank 2 when asked, and opens the eave wider for them", () => {
    const shuttered = design(house([at("dormer-cottage-half", 2, 0.125, { shutters: true })]));
    const plain = design(house([at("dormer-cottage-half", 2, 0.125, { shutters: false })]));
    const cuts = (r: ReturnType<typeof design>) =>
      r.parts.filter((p) => p.type === "roof").flatMap((p) => p.modifications.filter((m) => m.op === "removeArea"));
    const eaveSpan = (r: ReturnType<typeof design>) => {
      const m = cuts(r).find((c) => c.op === "removeArea" && c.rect[1] === 0);
      if (m?.op !== "removeArea") throw Error("no eave band");
      return m.rect[2] - m.rect[0];
    };
    expect(eaveSpan(shuttered)).toBeGreaterThan(eaveSpan(plain) * 1.2);
    const members = (r: ReturnType<typeof design>) =>
      coreBuildingDecorations(coreBuildingLayout(r, registry, {}), assets)
        .flatMap((d) => d.parts)
        .filter((p) => p.id.includes("shutter")).length;
    expect(members(shuttered)).toBe(2);
    expect(members(plain)).toBe(0);
  });

  it("is an error below the eave, on a gable end, and without a pitched roof", () => {
    expect(messages(design(house([at("dormer-gothic-half", 2, 0.125, { bottom: 0.5 })])))).toContain(
      "The window must cross the eave above it"
    );
    expect(messages(design(house([at("dormer-gothic-half", 2, 0.125, { bottom: 4.2 })])))).toContain(
      "The window stands above its wall"
    );
    // Of the two ridge directions, one makes this wall a gable end.
    const gables = [0, 1].map((ridge_direction) =>
      messages(design(house([at("dormer-gothic-half", 2, 0.125)], { roof: { ridge_length: 1, ridge_direction } })))
    );
    expect(gables.filter((m) => m.some((x) => x.includes("gable-end")))).toHaveLength(1);
    expect(gables.filter((m) => !m.length)).toHaveLength(1);
    expect(() => buildCoreHouse(house([at("dormer-gothic-half", 2, 0.125)], { roof: { height: 0 } }))).toThrow(
      "An eave dormer needs a pitched roof"
    );
  });

  it("is drawn with its roof picked as the dormer, and the eave cut by apertures", async () => {
    const result = design(house([at("dormer-gothic-half", 2, 0.125)]));
    const { renderInput } = await compileCoreBuilding(result, registry, { environment: { ground: flat }, assets });
    expect(renderInput.groups.filter((g) => g.role === "dormer_roof").map((g) => g.decorationId)).toEqual([
      "h/dormer-gothic-half-2"
    ]);
    expect(renderInput.dormerBins.report.inputCount).toBeGreaterThan(0);
  });

  it("comes from the European parameters and counts as a mounted part", () => {
    const a = {
      id: "w",
      kind: "window" as const,
      type: "dormer-arrow-slit-half",
      rank: 2 as const,
      u: 0.1,
      bottom: 3,
      width: 0.8,
      height: 2
    };
    const draft = European.buildHouses({ id: "e", attachments: [{ ...a, frameMaterial: "wall" }] });
    expect(draft.parts.find((p) => p.type === "eaveDormer")!.geometry!.generator).toBe("houseEaveMount");
    expect(MOUNTED_PART_TYPES).toContain("eaveDormer");
  });

  it.each([1, 2, 3] as const)("rank %i Gothic carries the full stone surround", async (rank) => {
    const p = house([at("dormer-gothic-half", rank, 0.125)]);
    const ours = coreBuildingDecorations(coreBuildingLayout(design(p), registry, {}), assets).flatMap((d) => d.stones);
    const planned = designBuilding(OnlineEuropean.buildHouses(p as never) as never, flat as never, assets);
    const theirs = profilePreview(
      buildingPreviewInput(planned, await prepareBuildingPublication(planned)),
      flat as never,
      {
        assets,
        retainDecorationParts: true
      } as never
    ).stones;
    expect(ours.map((s) => [s.template, s.instance.flags])).toEqual(theirs.map((s) => [s.template, s.instance.flags]));
  });

  it("stays whole next to another house, as online", () => {
    const window_ = at("dormer-cottage-half", 1, 0.375);
    const alone = designBuildingCore(buildCoreHouses([house([window_])]), registry, { environment });
    const mount = alone.parts.find((p) => p.type === "eaveDormer")!.original.elements.mount;
    if (mount.kind !== "point") throw Error("no mount");
    const [x, , z] = mount.frame.origin;
    const r = designBuildingCore(
      buildCoreHouses([
        house([window_]),
        { id: "n", height: 2, rectangle: { center: [x, z], size: [4, 4], rotation: 0 } }
      ]),
      registry,
      { environment }
    );
    expect(r.diagnostics).toEqual([]);
    expect(lay(r.parts.find((p) => p.type === "eaveDormer")!)).toHaveLength(1);
    expect(lay(r.parts.find((p) => p.type === "shedRoof")!).length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const p = house([at("dormer-cottage-half", 2, 0.125), at("dormer-gothic-half", 3, 0.375)]);
    const units = (r: ReturnType<typeof design>) => r.parts.map((q) => lay(q).map((u) => [u.key, ...u.matrix]));
    expect(units(design(p))).toEqual(units(design(structuredClone(p))));
  });

  it.each(["dormer-gothic-half", "dormer-cottage-half"])("opens the eave centred on %s near a hip", (type) => {
    const result = design(house([at(type, 1, 0.05)]));
    expect(result.diagnostics).toEqual([]);
    const roof = result.parts.find((p) => p.type === "roof" && p.modifications.some((m) => "rect" in m))!;
    const mount = result.parts.find((p) => p.type === "eaveDormer")!.original.elements.mount;
    if (mount.kind !== "point") throw Error("no mount");
    const surface = new EffectiveGeometry(roof.original, roof.modifications, registry.surfaces).surface("slope");
    const across = (q: readonly number[]) =>
      (q[0] - mount.frame.origin[0]) * mount.frame.x[0] + (q[2] - mount.frame.origin[2]) * mount.frame.x[2];
    for (const m of roof.modifications) {
      if (!("rect" in m)) continue;
      const [u0, v0, u1, v1] = m.rect;
      const middle = surface.frame((u0 + u1) / 2, (v0 + v1) / 2).origin;
      expect(Math.abs(across(middle))).toBeLessThan(0.06);
    }
  });
});
