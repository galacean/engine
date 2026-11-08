// Roof prefabs. A dormer stands on a roof slope or cone and carries a small roof of its own: its
// footprint comes out of the host roof, and the connection derives the small roof and its ridge.
// A hatch or a roof lantern stands on a flat roof's deck; a hatch opens the deck.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore, expandUnits, type ResolvedPart } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import {
  buildCoreHouse,
  type CoreHouseParameters,
  type CoreRoofAttachment
} from "../../src/building/application/CoreEuropean";
import { compileCoreBuilding, coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";

const registry = registerHouseTypes(createBuildingRegistry());
const flat = () => 0;
const environment = coreBuildingEnvironment(flat, nativeAssets.compilation);
const design = (house: CoreHouseParameters) => designBuildingCore(buildCoreHouse(house), registry, { environment });
const lay = (part: ResolvedPart) => expandUnits(part, registry, { environment });
const hip: CoreHouseParameters = {
  id: "h",
  height: 4,
  rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
  roof: { height: 0.6 }
};
const round: CoreHouseParameters = {
  id: "r",
  seed: 1,
  height: 3.125,
  circle: { center: [0, 0], radius: 2.4, phase: 0 },
  roof: { tip: [0, 0], profile: 0, height: 0.35, ridge_length: 0.6, eave: 0.3, ridge_direction: 0, flat_rim: 0 }
};
const dormer = (uv: [number, number], extra: Partial<CoreRoofAttachment> = {}): CoreRoofAttachment => ({
  id: "d",
  type: "dormer-gothic",
  rank: 2,
  uv,
  ...extra
});
const messages = (result: ReturnType<typeof design>) => result.diagnostics.map((d) => d.message);

describe("Dormers", () => {
  it.each([
    ["a hip roof", { ...hip, roofAttachments: [dormer([0.45, 0.2])] }],
    ["a round roof", { ...round, roofAttachments: [dormer([0.012, 0.657])] }]
  ] as [string, CoreHouseParameters][])("on %s: the prefab, its small roof and its ridge", (_name, house) => {
    const result = design(house);
    expect(result.diagnostics).toEqual([]);
    const byType = (type: string) => result.parts.filter((p) => p.type === type);
    expect(byType("dormer").map((p) => lay(p).length)).toEqual([1]);
    expect(lay(byType("dormerRoof")[0]).length).toBeGreaterThanOrEqual(8);
    expect(lay(byType("dormerRidge")[0]).length).toBeGreaterThanOrEqual(1);
    // The derived parts name the connection whose guest is the dormer.
    const connection = result.connections.find((c) => c.guest === byType("dormer")[0].key)!;
    expect(connection.rule).toBe("dormerOnRoof");
    for (const derived of [...byType("dormerRoof"), ...byType("dormerRidge")])
      expect(derived.identity).toMatchObject({ kind: "derived", connection: connection.key });
    // The footprint comes out of one roof part, as nested rectangles.
    const hosts = result.parts.filter((p) => p.type === "roof" && p.modifications.some((m) => m.op === "removeArea"));
    expect(hosts).toHaveLength(1);
    expect(hosts[0].modifications.filter((m) => m.op === "removeArea").length).toBeGreaterThanOrEqual(3);
  });

  it("stands on the roof's covering and faces level out of the slope", () => {
    const result = design({ ...hip, roofAttachments: [dormer([0.45, 0.2])] });
    const mount = result.parts.find((p) => p.type === "dormer")!.original.elements.mount;
    if (mount.kind !== "point") throw Error("no mount");
    // The front slope faces +z.
    expect(mount.frame.z[0]).toBeCloseTo(0, 6);
    expect(mount.frame.z[1]).toBeCloseTo(0, 6);
    expect(mount.frame.z[2]).toBeCloseTo(1, 6);
    expect(mount.frame.y).toEqual([0, 1, 0]);
    // Plan position from the footprint uv: x = (0.45 - 0.5) * 10, z = (0.5 - 0.2) * 8.
    expect(mount.frame.origin[0]).toBeCloseTo(-0.5, 6);
    expect(mount.frame.origin[2]).toBeCloseTo(2.4, 6);
    // Its sweep reaches back until the peak meets the roof.
    const sweep = result.parts.find((p) => p.type === "dormer")!.original.elements.sweep;
    if (sweep.kind !== "surface") throw Error("no sweep");
    expect((sweep.surface.params as { depth: number }).depth).toBeGreaterThan(0.5);
  });

  it("drops only the host tiles that lie wholly under the dormer", () => {
    const tiles = (house: CoreHouseParameters) =>
      design(house)
        .parts.filter((p) => p.type === "roof")
        .reduce((n, p) => n + lay(p).length, 0);
    const without = tiles(hip),
      withDormer = tiles({ ...hip, roofAttachments: [dormer([0.45, 0.2])] });
    expect(withDormer).toBeLessThan(without);
    expect(without - withDormer).toBeLessThan(8);
  });

  it("is an error where no roof slope lies under it, where it crosses an edge, or where it outgrows the roof", () => {
    // Over a gable wall there is no slope.
    const gable = design({ ...hip, roof: { height: 0.6, ridge_length: 1 }, roofAttachments: [dormer([0.02, 0.5])] });
    expect(messages(gable).some((m) => m.startsWith("No roof at plan position"))).toBe(true);
    // Next to a hip it reaches into the neighbouring slope.
    const corner = design({ ...hip, roofAttachments: [dormer([0.12, 0.12])] });
    expect(messages(corner)).toContain("The dormer crosses an edge of its roof");
    // A dormer taller than the roof cannot meet it.
    const tall = design({ ...hip, roof: { height: 0.15 }, roofAttachments: [dormer([0.5, 0.3], { height: 6 })] });
    expect(messages(tall)).toContain("The dormer reaches above its roof");
    // A flat roof has no slope for a dormer.
    expect(() => buildCoreHouse({ ...hip, roof: { height: 0 }, roofAttachments: [dormer([0.5, 0.3])] })).toThrow(
      "A dormer needs a pitched roof"
    );
  });

  it("draws its small roof settled and picked as the dormer, and cuts the host tiles at its footprint", async () => {
    const result = design({ ...hip, roofAttachments: [dormer([0.45, 0.2])] });
    const { renderInput } = await compileCoreBuilding(result, registry, {
      environment: { ground: flat },
      assets: nativeAssets.compilation
    });
    const carried = renderInput.groups.filter((g) => g.role === "dormer_roof");
    expect(carried.map((g) => g.decorationId)).toEqual(["h/d"]);
    const records = carried[0].units.roof_tile;
    for (let i = 0; i < carried[0].cells.length; i++)
      expect(new DataView(records.buffer, records.byteOffset + i * 64).getFloat32(48, true)).toBe(1);
    const footprint = result.parts
      .filter((p) => p.type === "roof")
      .reduce((n, p) => n + p.modifications.filter((m) => m.op === "removeArea").length, 0);
    expect(renderInput.dormerBins.report.inputCount).toBe(footprint);
  });

  it("is deterministic", () => {
    const house = { ...round, roofAttachments: [dormer([0.012, 0.657])] };
    const units = (r: ReturnType<typeof design>) => r.parts.map((p) => lay(p).map((u) => [u.key, ...u.matrix]));
    expect(units(design(house))).toEqual(units(design(structuredClone(house))));
  });
});

describe("Deck prefabs", () => {
  const deck: CoreHouseParameters = {
    id: "f",
    height: 4,
    rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
    roof: { height: 0 }
  };
  const on = (type: CoreRoofAttachment["type"], uv: [number, number]): CoreRoofAttachment => ({ id: "x", type, uv });
  const mountOf = (result: ReturnType<typeof design>) => {
    const e = result.parts.find((p) => p.type === "hatch" || p.type === "roofLamp")!.original.elements.mount;
    if (e.kind !== "point") throw Error("no mount");
    return e.frame;
  };
  it("faces the nearest edge (a hatch) or the front (a lantern), standing on the deck", () => {
    // Nearer the +x side than the -z or +z sides, in proportion.
    const hatch = design({ ...deck, roofAttachments: [on("hatch-cottage", [0.85, 0.45])] });
    expect(hatch.diagnostics).toEqual([]);
    expect(mountOf(hatch).z.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([1, 0, 0]);
    const lamp = design({ ...deck, roofAttachments: [on("roof-lantern", [0.85, 0.45])] });
    expect(lamp.diagnostics).toEqual([]);
    expect(mountOf(lamp).z.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([0, 0, 1]);
    // The deck loses the hatch's opening, and only the pieces wholly inside it.
    const count = (r: ReturnType<typeof design>) => lay(r.parts.find((p) => p.type === "roofDeck")!).length;
    const opened = count(hatch),
      whole = count(design(deck));
    expect(opened).toBeLessThan(whole);
    expect(whole - opened).toBeLessThan(8);
  });
  it("stays inside the walls' inner face", () => {
    const result = design({ ...deck, roofAttachments: [on("hatch-gothic", [0.98, 0.5])] });
    expect(messages(result)).toContain("The prefab stands outside the roof deck");
  });
  it("needs a flat roof, as a dormer needs a pitched one", () => {
    expect(() => buildCoreHouse({ ...hip, roofAttachments: [on("hatch-cottage", [0.5, 0.5])] })).toThrow(
      "A hatch-cottage needs a flat roof"
    );
  });
});

describe("Shed dormers", () => {
  const cottage = (rank: 1 | 2 | 3, uv: [number, number], width?: number): CoreRoofAttachment => ({
    id: "c",
    type: "dormer-cottage",
    rank,
    uv,
    ...(width !== undefined && { width })
  });
  const bodies = (result: ReturnType<typeof design>) => lay(result.parts.find((p) => p.type === "shedDormer")!);
  it("stands rank bodies side by side under one shed, and resizes the row as a whole", () => {
    const three = design({ ...hip, roof: { height: 0.8 }, roofAttachments: [cottage(3, [0.5, 0.15])] });
    expect(three.diagnostics).toEqual([]);
    const units = bodies(three);
    expect(units).toHaveLength(3);
    const x = units.map((u) => u.matrix[12]);
    expect(x[1] - x[0]).toBeCloseTo(0.7333, 3);
    expect(x[2] - x[1]).toBeCloseTo(0.7333, 3);
    // A row twice as wide doubles the bodies and their spacing.
    const natural = 0.8 + 2 * 0.7333;
    const wide = bodies(
      design({ ...hip, roof: { height: 0.8 }, roofAttachments: [cottage(3, [0.5, 0.15], 2 * natural)] })
    );
    expect(wide[1].matrix[12] - wide[0].matrix[12]).toBeCloseTo(2 * 0.7333, 3);
    // Each body stretches twice across (the unit matrix carries the stretch).
    expect(Math.hypot(wide[0].matrix[0], wide[0].matrix[1], wide[0].matrix[2])).toBeCloseTo(2, 3);
    // The shed and the cut behind the bodies.
    const shed = three.parts.find((p) => p.type === "shedRoof")!;
    expect(lay(shed).length).toBeGreaterThan(20);
    const host = three.parts.filter((p) => p.type === "roof" && p.modifications.some((m) => m.op === "removeArea"));
    expect(host).toHaveLength(1);
  });
  it("is an error where the row reaches past its roof part", () => {
    const result = design({ ...hip, roofAttachments: [cottage(3, [0.08, 0.2])] });
    expect(messages(result)).toContain("The dormer crosses an edge of its roof");
  });
});
