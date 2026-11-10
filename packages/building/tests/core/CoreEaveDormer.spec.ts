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
  coreBuildingDiagnostics,
  coreBuildingEnvironment,
  coreBuildingLayout,
  roofApertures
} from "../../src/building/render/CoreBuilding";
import { frozen } from "./baseline";
import { decorationSize } from "./decorationSizes";
import { MOUNTED_PART_TYPES } from "../../src/building/partTypes";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const assets = nativeAssets.compilation;
const environment = coreBuildingEnvironment(flat, assets);
const design = (p: CoreHouseParameters) => designBuildingCore(buildCoreHouse(p), registry, { environment });
const lay = (part: ResolvedPart) => expandUnits(part, registry, { environment });
const square = { center: [0, 0] as [number, number], size: [10, 10] as [number, number], rotation: 0 };
const at = (type: string, rank: 1 | 2 | 3, u: number, extra: Partial<CoreWallAttachment> = {}): CoreWallAttachment => {
  const size = decorationSize(type, rank);
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
/** What online drew for each eave dormer: its decoration parts (id, mesh size in floats, mesh
 * center), and the template and flags of each stone of a Gothic surround. */
const ONLINE = frozen<{
  parts: Record<string, { id: string; floats: number; center: number[] }[]>;
  stones: Record<string, [string, number][]>;
}>("CoreEaveDormer");
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
  ] as [string, CoreWallAttachment][])("%s: the same meshes at the same place", (name, a) => {
    const p = house([a]);
    const result = design(p);
    expect(result.diagnostics).toEqual([]);
    const ours = coreBuildingDecorations(coreBuildingLayout(result, registry, {}), assets).flatMap((d) => d.parts);
    const theirs = ONLINE.parts[name];
    expect(ours.map((x) => x.id).sort()).toEqual(theirs.map((x) => x.id).sort());
    for (const x of ours) {
      const o = theirs.find((y) => y.id === x.id)!;
      expect(x.positions.length).toBe(o.floats);
      const [c, d] = [center(x.positions), o.center];
      for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - d[k])).toBeLessThan(0.03);
    }
  });

  it("centres every row of its shed on the window, close to a hip as anywhere", () => {
    for (const u of [0.12, 0.28]) {
      const result = design(house([at("dormer-cottage-half", 2, u)], { rectangle: { ...square, size: [12, 8] } }));
      expect(result.diagnostics).toEqual([]);
      const part = result.parts.find((p) => p.type === "eaveDormer")!;
      const { shed, mount } = part.original.elements;
      if (shed?.kind !== "surface" || mount?.kind !== "point") throw Error("no shed");
      const { origin, x } = mount.frame;
      const rows = (shed.surface.params as { rows: { points: number[][] }[] }).rows;
      // The roof's rows fan toward its ridge; the shed's rows still stand square over the window.
      const offsets = rows.map(({ points }) => {
        const q = points[(points.length - 1) / 2];
        return (q[0] - origin[0]) * x[0] + (q[2] - origin[2]) * x[2];
      });
      expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(0.01);
      // And they draw in toward the ridge with the roof's rows, as online does.
      const width = ({ points }: { points: number[][] }) => {
        const [a, b] = [points[0], points[points.length - 1]];
        return Math.abs((b[0] - a[0]) * x[0] + (b[2] - a[2]) * x[2]);
      };
      expect(width(rows[rows.length - 1])).toBeLessThan(width(rows[0]) - 0.02);
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

  it("has shutters on rank 2 when asked, and the tiles beside the window end against them", () => {
    const shuttered = design(house([at("dormer-cottage-half", 2, 0.125, { shutters: true })]));
    const plain = design(house([at("dormer-cottage-half", 2, 0.125, { shutters: false })]));
    const roofMods = (r: ReturnType<typeof design>) =>
      r.parts.filter((p) => p.type === "roof").flatMap((p) => p.modifications);
    const eaveSpan = (r: ReturnType<typeof design>) => {
      const m = roofMods(r).find((c) => c.op === "removeArea" && c.rect[1] === 0);
      if (m?.op !== "removeArea") throw Error("no eave band");
      return m.rect[2] - m.rect[0];
    };
    // The opening stays as wide as the window: the tiles between a shutter and the wall stay.
    expect(eaveSpan(shuttered)).toBeCloseTo(eaveSpan(plain), 6);
    const boxes = (r: ReturnType<typeof design>) => roofMods(r).flatMap((m) => (m.op === "clearBox" ? [m.box] : []));
    expect(boxes(plain)).toEqual([]);
    expect(boxes(shuttered)).toHaveLength(2);
    const mount = shuttered.parts.find((p) => p.type === "eaveDormer")!.original.elements.mount;
    if (mount.kind !== "point") throw Error("no mount");
    const { origin, x, z } = mount.frame;
    const shutters = coreBuildingDecorations(coreBuildingLayout(shuttered, registry, {}), assets)
      .flatMap((d) => d.parts)
      .filter((p) => p.id.includes("shutter"));
    const sides = boxes(shuttered).map(({ center, size, out }) => {
      // Each box points away from the wall, turned with its open shutter.
      expect(Math.hypot(out[0], out[2])).toBeCloseTo(1, 6);
      const facing = out[0] * z[0] + out[2] * z[2];
      expect(facing).toBeGreaterThan(0);
      expect(facing).toBeLessThan(Math.cos((10 * Math.PI) / 180));
      // One shutter stands in it, from its back face on.
      const across = [-out[2], 0, out[0]];
      const inside = shutters.filter((p) => {
        const q = p.positions;
        for (let i = 0; i < q.length; i += 3) {
          const d = [q[i] - center[0], q[i + 1] - center[1], q[i + 2] - center[2]];
          if (Math.abs(d[0] * across[0] + d[2] * across[2]) > size[0] / 2 + 1e-3) return false;
          if (Math.abs(d[1]) > size[1] / 2 + 1e-3) return false;
          if (Math.abs(d[0] * out[0] + d[2] * out[2]) > size[2] / 2 + 1e-3) return false;
        }
        return true;
      });
      expect(inside).toHaveLength(1);
      const q = inside[0].positions;
      const back = Math.min(
        ...Array.from(
          { length: q.length / 3 },
          (_, i) => (q[3 * i] - center[0]) * out[0] + (q[3 * i + 2] - center[2]) * out[2]
        )
      );
      expect(back).toBeCloseTo(-size[2] / 2, 2);
      return Math.sign((center[0] - origin[0]) * x[0] + (center[2] - origin[2]) * x[2]);
    });
    // One on each side of the window.
    expect(sides.sort()).toEqual([-1, 1]);
    const members = (r: ReturnType<typeof design>) =>
      coreBuildingDecorations(coreBuildingLayout(r, registry, {}), assets)
        .flatMap((d) => d.parts)
        .filter((p) => p.id.includes("shutter")).length;
    expect(members(shuttered)).toBe(2);
    expect(members(plain)).toBe(0);
    // The shutters hang beside the window: it keeps its size with them.
    const frame = (r: ReturnType<typeof design>) =>
      coreBuildingDecorations(coreBuildingLayout(r, registry, {}), assets)
        .flatMap((d) => d.parts)
        .find((p) => p.id.endsWith("frame"))!.positions;
    const width = (q: number[]) => {
      const xs = q.filter((_, i) => i % 3 === 2);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(frame(shuttered))).toBeCloseTo(width(frame(plain)), 3);
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

  it("is an error across an edge of its roof part, with an arch as with a shed", () => {
    const hipped = {
      rectangle: { center: [0, 0] as [number, number], size: [8, 6] as [number, number], rotation: 0 },
      roof: { height: 0.35, profile: 1 }
    };
    const near = (type: string, rank: 1 | 2 | 3, u: number) =>
      messages(design(house([at(type, rank, u, { width: 2, height: 2.4, bottom: 2 })], hipped)));
    // Near the corner the dormer reaches over the hip onto the next slope.
    expect(near("dormer-gothic-half", 2, 0.06)).toContain("The dormer crosses an edge of its roof");
    expect(near("dormer-cottage-half", 2, 0.06)).toContain("The dormer crosses an edge of its roof");
    expect(near("dormer-gothic-half", 2, 0.125)).toEqual([]);
  });

  it("is drawn with its roof picked as the dormer, and the eave cut by apertures", async () => {
    const result = design(house([at("dormer-gothic-half", 2, 0.125)]));
    const { renderInput } = await compileCoreBuilding(result, registry, { environment: { ground: flat }, assets });
    expect(renderInput.groups.filter((g) => g.role === "dormer_roof").map((g) => g.decorationId)).toEqual([
      "h/dormer-gothic-half-2"
    ]);
    expect(renderInput.dormerBins.report.inputCount).toBeGreaterThan(0);
  });

  it.each(["dormer-gothic-half", "dormer-cottage-half"])(
    "%s: its eave opening takes in every eave tile that hangs into it",
    (type) => {
      const result = design(house([at(type, 2, 0.125)]));
      expect(result.diagnostics).toEqual([]);
      const roof = result.parts.find((p) => p.type === "roof" && p.modifications.some((m) => m.op === "removeArea"))!;
      // Plain boxes: center, size along (across, up, out), level outward direction.
      const boxes = roofApertures(coreBuildingLayout(result, registry, {})).flatMap((r) => {
        const f = new DataView(r.buffer, r.byteOffset, 48);
        const get = (o: number) => f.getFloat32(o, true);
        if (get(40) !== 1 || get(44) !== -1) return [];
        const out = [get(32), 0, get(36)];
        return [{ c: [get(0), get(4), get(8)], s: [get(16), get(20), get(24)], out, across: [-out[2], 0, out[0]] }];
      });
      const local = (b: (typeof boxes)[number], p: readonly number[]) => {
        const d = [p[0] - b.c[0], p[1] - b.c[1], p[2] - b.c[2]];
        return [d[0] * b.across[0] + d[2] * b.across[2], d[1], d[0] * b.out[0] + d[2] * b.out[2]];
      };
      const inside = (b: (typeof boxes)[number], p: readonly number[]) =>
        local(b, p).every((v, k) => Math.abs(v) <= b.s[k] / 2 + 1e-4);
      // The box that opens the eave reaches furthest out.
      const eave = boxes.reduce((a, b) => (local(b, b.c)[2] + b.s[2] / 2 > local(a, a.c)[2] + a.s[2] / 2 ? b : a));
      // A first-row tile hangs from where it is laid, down the roof, by its length.
      const hanging = lay(roof).filter((u) => /^0\//.test(u.key) && inside(eave, u.frame.origin));
      expect(hanging.length).toBeGreaterThan(0);
      for (const u of hanging) {
        const { origin, x, y } = u.frame;
        const [w, l] = u.size!;
        for (const s of [-0.5, 0.5]) {
          const end = [0, 1, 2].map((k) => origin[k] + x[k] * w * s + y[k] * l);
          // Out and down: a tile may straddle the opening's sides, but not hang past its reach.
          const [, up, out] = local(eave, end);
          expect(up).toBeGreaterThanOrEqual(-eave.s[1] / 2 - 1e-4);
          expect(out).toBeLessThanOrEqual(eave.s[2] / 2 + 1e-4);
        }
      }
    }
  );

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

  it.each([1, 2, 3] as const)("rank %i Gothic carries the full stone surround", (rank) => {
    const p = house([at("dormer-gothic-half", rank, 0.125)]);
    const ours = coreBuildingDecorations(coreBuildingLayout(design(p), registry, {}), assets).flatMap((d) => d.stones);
    expect(ours.map((s) => [s.template, s.instance.flags])).toEqual(ONLINE.stones[`Gothic ${rank}`]);
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
      if (m.op !== "removeArea") continue;
      const side = m.outline!.map(([u, v]) => across(surface.frame(u, v).origin));
      expect(Math.abs((Math.min(...side) + Math.max(...side)) / 2)).toBeLessThan(0.06);
    }
  });

  it("opens the roof behind a shed's window up to the window's top", () => {
    const result = design(house([at("dormer-cottage-half", 2, 0.125, { shutters: false })]));
    expect(result.diagnostics).toEqual([]);
    const window = result.parts.find((p) => p.type === "eaveDormer")!;
    const shed = window.original.elements.shed;
    if (shed?.kind !== "surface") throw Error("no shed");
    const top = (shed.surface.params as { rows: { points: number[][] }[] }).rows[0].points[4][1];
    const roof = result.parts.find((p) => p.type === "roof" && p.modifications.some((m) => m.op === "removeArea"))!;
    const surface = new EffectiveGeometry(roof.original, roof.modifications, registry.surfaces).surface("slope");
    const reach = Math.max(
      ...roof.modifications.flatMap((m) =>
        m.op === "removeArea" ? [surface.frame((m.rect[0] + m.rect[2]) / 2, m.rect[3]).origin[1]] : []
      )
    );
    expect(reach).toBeGreaterThan(top - 0.2);
  });

  it("cuts the tiles that hang over a shed's eave as high as the whole opening reaches", async () => {
    const result = design(house([at("dormer-cottage-half", 2, 0.125)]));
    expect(result.diagnostics).toEqual([]);
    const { renderInput } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets.compilation
    });
    const { holes } = renderInput.dormerBins;
    const view = new DataView(holes.buffer, holes.byteOffset, holes.byteLength);
    const boxes = new Map<string, { top: number; depth: number }>();
    for (let k = 0; k + 48 <= holes.byteLength; k += 48) {
      const depth = view.getFloat32(k + 24, true);
      if (!(depth > 0)) continue;
      const top = view.getFloat32(k + 4, true) + view.getFloat32(k + 20, true) / 2;
      boxes.set(`${view.getFloat32(k, true)}/${top}/${depth}`, { top, depth });
    }
    // A plain rectangle in plan: one box that reaches out past the roof's edge.
    expect(boxes.size).toBe(1);
    const [box] = [...boxes.values()];
    expect(box.depth).toBeGreaterThan(1);
    const roof = result.parts.find((p) => p.type === "roof" && p.modifications.some((m) => m.op === "removeArea"))!;
    const surface = new EffectiveGeometry(roof.original, roof.modifications, registry.surfaces).surface("slope");
    const area = roof.modifications.find((m) => m.op === "removeArea")!;
    if (area.op !== "removeArea") throw Error("no area");
    expect(box.top).toBeGreaterThan(Math.max(...area.outline!.map(([u, v]) => surface.frame(u, v).origin[1])));
  });

  it.each([
    ["dormer-gothic-half", 3, 0.3],
    ["dormer-arrow-slit-half", 3, 0.44]
  ] as const)("cuts the tiles along the arch of %s %s, with no steps", async (type, rank, u) => {
    const result = design(house([at(type, rank, u)]));
    expect(result.diagnostics).toEqual([]);
    const { renderInput } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets.compilation
    });
    const { holes } = renderInput.dormerBins;
    const view = new DataView(holes.buffer, holes.byteOffset, holes.byteLength);
    const seen = new Map<string, { y: number; h: number; w: number; k: number; a: number }>();
    for (let n = 0; n + 48 <= holes.byteLength; n += 48) {
      const h = view.getFloat32(n + 20, true);
      if (!(h > 0)) continue;
      const box = {
        y: view.getFloat32(n + 4, true),
        h,
        w: view.getFloat32(n + 16, true),
        k: view.getFloat32(n + 40, true),
        a: view.getFloat32(n + 44, true)
      };
      seen.set(JSON.stringify(box), box);
    }
    const boxes = [...seen.values()];
    const sweep = result.parts.find((p) => p.type === "eaveDormer")!.original.elements.sweep;
    if (sweep?.kind !== "surface") throw Error("no sweep");
    const arch = sweep.surface.params as { origin: number[]; outline: number[][] };
    const right = arch.outline.slice(Math.floor(arch.outline.length / 2));
    const outline = (height: number) => {
      for (let i = 1; i < right.length; i++)
        if (height >= right[i][1])
          return (
            right[i - 1][0] +
            ((right[i][0] - right[i - 1][0]) * (right[i - 1][1] - height)) / (right[i - 1][1] - right[i][1])
          );
      return right[right.length - 1][0];
    };
    const opened = (world: number) => {
      let width = 0;
      for (const b of boxes) {
        const y = (world - b.y) / b.h;
        if (!(y > -0.5 && y < (b.k === 1 ? 0.5 : Math.fround(0.7)))) continue;
        const t = Math.min(1, Math.max(0, y * b.k + b.a));
        width = Math.max(width, 0.5 * b.w * (1 - t * t * t));
      }
      return width;
    };
    const base = right[right.length - 1][1],
      peak = right[0][1];
    // The opening ends a little below the peak; the host's tiles run on under the small roof there.
    const end = peak - 0.35;
    for (let i = 1; i < 40; i++) {
      const height = base + ((end - base) * i) / 40;
      // The opening follows the arch. At the eave it is wider, for the tiles that hang below.
      const gap = opened(arch.origin[1] + height) - outline(height);
      expect(gap).toBeGreaterThan(-0.025);
      expect(gap).toBeLessThan(0.12);
    }
  });

  it("takes a short cap on a short ridge", () => {
    const hills = (x: number, z: number) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
    const { width, height } = decorationSize("dormer-gothic-half", 2);
    const result = designBuildingCore(
      buildCoreHouse({
        id: "h",
        seed: 11,
        height: 5,
        rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
        attachments: [
          {
            id: "a",
            kind: "window",
            type: "dormer-gothic-half",
            rank: 2,
            u: 0.11,
            bottom: 5 - height * 0.6,
            width,
            height
          }
        ]
      }),
      registry,
      { environment: coreBuildingEnvironment(hills, assets) }
    );
    expect(result.diagnostics).toEqual([]);
  });

  it("leaves the tiles uncut, without failing, past the capacity of a bin", async () => {
    const windows = [0, 1, 2, 3].flatMap((side) =>
      [0.26, 0.38, 0.5, 0.62, 0.74].map((t, i) => ({
        ...at("dormer-gothic-half", 1, (side + t) / 4),
        id: `w${side}-${i}`
      }))
    );
    const p = house(windows, { rectangle: { center: [0, 0], size: [8, 8], rotation: 0 } });
    const result = design(p);
    expect(result.diagnostics).toEqual([]);
    const { renderInput } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets.compilation
    });
    expect(renderInput.dormerBins.report.inputCount).toBeGreaterThan(49);
    expect(renderInput.dormerBins.report.droppedAssignments).toBeGreaterThan(0);
    const notes = coreBuildingDiagnostics(coreBuildingLayout(result, registry, { environment: { ground: flat } }));
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain("leave their tiles uncut");
  });
});
