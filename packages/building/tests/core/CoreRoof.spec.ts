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
  expandUnits,
  type BuildingCoreDraft,
  type ResolvedPart
} from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import type { RoofSlopeParams } from "../../src/building/partTypes/Roof";
import { buildCoreHouse, type CoreHouseParameters } from "../../src/building/application/CoreEuropean";
import { coreHouseRenderInput } from "../../src/building/render/CoreHouseRender";

const flat = () => 0;
const registry = registerHouseTypes(createBuildingRegistry());
function roof(p: CoreHouseParameters, draft: BuildingCoreDraft = buildCoreHouse(p)) {
  const result = designBuildingCore(draft, registry, { environment: { ground: flat } });
  const of = (type: string) => result.parts.filter((x) => x.type === type);
  return { result, slopes: of("roof"), hips: of("hipCap"), ridges: of("ridgeCap"), rakes: of("rakeCap") };
}
const units = (part: ResolvedPart) => expandUnits(part, registry, { environment: { ground: flat } });
const slopeOf = (part: ResolvedPart) =>
  (part.original.elements.slope as { surface: { params: RoofSlopeParams } }).surface.params;
const clipsOf = (part: ResolvedPart) => part.modifications.filter((m) => m.op === "clip");

describe("Roof slopes", () => {
  it("lays a hip roof as four slopes with hip and ridge caps", () => {
    const { result, slopes, hips, ridges, rakes } = roof({ id: "a" });
    expect(result.diagnostics).toEqual([]);
    expect(slopes).toHaveLength(4);
    expect(hips).toHaveLength(4);
    expect(ridges).toHaveLength(1);
    expect(rakes).toHaveLength(0);
    // Each slope is clipped along its two hips.
    for (const slope of slopes) expect(clipsOf(slope)).toHaveLength(2);
  });

  it("lays a gable roof as two slopes with a ridge cap and rake caps over the gables", () => {
    const { result, slopes, hips, ridges, rakes } = roof({ id: "g", roof: { ridge_length: 1 } });
    expect(result.diagnostics).toEqual([]);
    expect(slopes).toHaveLength(2);
    expect(hips).toHaveLength(0);
    expect(ridges).toHaveLength(1);
    expect(rakes).toHaveLength(4);
    for (const slope of slopes) expect(clipsOf(slope)).toHaveLength(2);
  });

  it("gives a pyramid roof no ridge cap", () => {
    const { result, hips, ridges } = roof({ id: "p", roof: { ridge_length: 0 } });
    expect(result.diagnostics).toEqual([]);
    expect(hips).toHaveLength(4);
    expect(ridges).toHaveLength(0);
  });

  it("keeps tiles below the top and gives each one of its slope's clips", () => {
    for (const p of [{ id: "a" }, { id: "r", rectangle: { center: [1, 2], size: [10, 7], rotation: 0.6 } }] as const) {
      const { slopes } = roof(p as CoreHouseParameters);
      for (const slope of slopes) {
        const s = slopeOf(slope);
        const planes = clipsOf(slope).map((m) => JSON.stringify((m as { plane: number[] }).plane));
        const laid = units(slope);
        expect(laid.length).toBeGreaterThan(20);
        for (const u of laid) {
          // Eave closures hang below the eave; tiles sit on their row lines.
          if (!u.key.startsWith("eave/")) expect(u.frame.origin[1]).toBeGreaterThanOrEqual(s.base - 1e-9);
          expect(u.frame.origin[1]).toBeLessThanOrEqual(s.base + s.height + 1e-9);
          expect(planes).toContain(JSON.stringify(u.params!.clip));
          // Tiles face out of the roof.
          expect(u.frame.z[1]).toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not depend on part or connection order", () => {
    const draft = buildCoreHouse({ id: "a" });
    const reversed = { ...draft, parts: [...draft.parts].reverse(), connections: [...draft.connections!].reverse() };
    const all = (r: ReturnType<typeof roof>) => r.result.parts.map((p) => [p.key, units(p)]);
    expect(all(roof({ id: "a" }, reversed))).toEqual(all(roof({ id: "a" }, draft)));
  });

  it("follows the ridge direction", () => {
    const along = (p: CoreHouseParameters) => {
      const ridge = roof(p).ridges[0];
      const points = (ridge.original.elements.ridge as { curve: { points: number[][] } }).curve.points;
      return Math.abs(points[1][0] - points[0][0]) > Math.abs(points[1][2] - points[0][2]) ? "x" : "z";
    };
    expect(along({ id: "a" })).toBe("x");
    expect(along({ id: "a", roof: { ridge_direction: 1 } })).toBe("z");
  });

  it("replaces the online roof tiles and caps in the render input", async () => {
    const p = { id: "a" };
    const { result, slopes, hips, ridges } = roof(p);
    const input = await coreHouseRenderInput(result, registry, p, flat, nativeAssets);
    const group = (role: string) => input.groups.find((g) => g.role === role && g.binding_id === "a-roof/placement")!;
    const count = (parts: ResolvedPart[], keep: (key: string) => boolean) =>
      parts.flatMap((part) => units(part).filter((u) => keep(u.key))).length;
    const tiles = count(slopes, (key) => !key.startsWith("eave/"));
    const others = count(slopes, (key) => key.startsWith("eave/")) + count([...hips, ...ridges], () => true);
    expect(group("layout").cells).toHaveLength(tiles);
    expect(group("connections").cells).toHaveLength(others);
    expect(group("layout").units.roof_tile.byteLength).toBe(tiles * 64);
    for (const step of group("layout").gravity!) expect(step.instance_count).toBe(tiles);
  });

  it("puts each slope over the wall it attaches to", () => {
    for (const rotation of [0, 0.6, 1.6, 3, -1.2])
      for (const ridge_direction of [0, 1])
        for (const ridge_length of [0.6, 1]) {
          const p = {
            id: "a",
            rectangle: { center: [0, 0], size: [8, 6], rotation },
            roof: { ridge_direction, ridge_length }
          };
          const draft = buildCoreHouse(p as CoreHouseParameters);
          const { result, slopes } = roof(p as CoreHouseParameters, draft);
          expect(result.diagnostics).toEqual([]);
          for (const slope of slopes) {
            const s = slopeOf(slope);
            const eave = [(s.b0[0] + s.b1[0]) / 2, (s.b0[1] + s.b1[1]) / 2];
            const host = draft.connections!.find((c) => c.kind === "attach" && c.guest === slope.identity.id)!;
            const hosts = (host as { hosts: { part: string }[] }).hosts;
            expect(hosts).toHaveLength(1);
            const wall = result.parts.find((w) => w.identity.id === hosts[0].part)!;
            const points = (wall.original.elements.face as { surface: { params: { points: number[][] } } }).surface
              .params.points;
            const [a, b] = [points[0], points[points.length - 1]];
            // The eave runs along the wall, outside it by the overhang.
            const along = [b[0] - a[0], b[2] - a[2]];
            const cross = (along[0] * (eave[1] - a[2]) - along[1] * (eave[0] - a[0])) / Math.hypot(...along);
            expect(Math.abs(cross)).toBeLessThan(1);
            const t = (along[0] * (eave[0] - a[0]) + along[1] * (eave[1] - a[2])) / (along[0] ** 2 + along[1] ** 2);
            expect(t).toBeGreaterThan(0.3);
            expect(t).toBeLessThan(0.7);
          }
        }
  });

  it("keeps every tile and cap inside its unit range over a sweep of roofs", () => {
    for (const height of [0.2, 1])
      for (const profile of [0, 1])
        for (const ridge_length of [0, 0.6, 1])
          for (const eave of [0, 1])
            for (const size of [
              [4, 3],
              [16, 5]
            ] as [number, number][])
              for (const ridge_direction of [0, 1]) {
                const p = {
                  id: "a",
                  rectangle: { center: [0, 0] as [number, number], size, rotation: 0.3 },
                  roof: { height, profile, ridge_length, eave, ridge_direction }
                };
                expect(roof(p).result.diagnostics).toEqual([]);
              }
  });

  it("gives caps their own unit range and keeps the tile depth fixed", () => {
    const { slopes, hips, ridges } = roof({ id: "a" });
    const tile = slopes[0].unit!;
    expect(tile.range!.min[2]).toBe(tile.range!.max[2]);
    for (const cap of [...hips, ...ridges]) {
      expect(cap.unit!.source).toBe(tile.source);
      expect(cap.unit!.range).not.toEqual(tile.range);
    }
  });
});
