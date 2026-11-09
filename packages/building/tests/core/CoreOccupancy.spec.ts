// The space a building prefab occupies, measured from its members.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { meshOccupancy, type OccupancySolid } from "../../src/building/resources/BuildingOccupancy";
import { createBuildingRegistry, designBuildingCore, type RuleContext } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouse } from "../../src/building/application/CoreEuropean";
import { coreBuildingEnvironment } from "../../src/building/render/CoreBuilding";
import { constructionDecorationType } from "../../src/building/runtime/ConstructionDecorationCatalog";

const prefabs = nativeAssets.compilation.prefabs;
const box = (lo: number[], hi: number[]) => {
  const positions = Array.from({ length: 8 }, (_, b) => [0, 1, 2].map((a) => ((b >> a) & 1 ? hi[a] : lo[a]))).flat();
  const faces = [
    0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3
  ];
  return { positions, faces };
};
const contains = (s: OccupancySolid, x: number, y: number, z: number) =>
  y >= s.y[0] &&
  y <= s.y[1] &&
  s.hull.every((a, i) => {
    const b = s.hull[(i + 1) % s.hull.length];
    return (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9;
  });

describe("Prefab occupancy", () => {
  it("is one layer for a box, whatever the height", () => {
    const { positions, faces } = box([-1, 0, -0.5], [1, 3, 0.5]);
    const solids = meshOccupancy("a", positions, faces);
    expect(solids).toHaveLength(1);
    expect(solids[0].y[0]).toBeCloseTo(0, 6);
    expect(solids[0].y[1]).toBeCloseTo(3, 6);
    expect(solids[0].hull).toHaveLength(4);
  });

  it("follows a shape that narrows, in layers", () => {
    // A pyramid: 2 m wide at the bottom and a point 2 m up.
    const positions = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1, 0, 2, 0];
    const faces = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];
    const solids = meshOccupancy("a", positions, faces);
    expect(solids.length).toBeGreaterThan(4);
    const width = (s: OccupancySolid) => Math.max(...s.hull.map((p) => p[0])) - Math.min(...s.hull.map((p) => p[0]));
    for (let i = 1; i < solids.length; i++) expect(width(solids[i])).toBeLessThan(width(solids[i - 1]));
  });

  it("exists for every building prefab, with convex outlines inside its heights", () => {
    expect(Object.keys(prefabs).length).toBeGreaterThan(29);
    for (const prefab of Object.values(prefabs)) {
      expect(prefab.occupancy.length).toBeGreaterThan(0);
      for (const s of prefab.occupancy) {
        expect(s.y[1]).toBeGreaterThan(s.y[0]);
        expect(s.hull.length).toBeGreaterThanOrEqual(3);
        s.hull.forEach((a, i) => {
          const b = s.hull[(i + 1) % s.hull.length],
            c = s.hull[(i + 2) % s.hull.length];
          expect((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])).toBeGreaterThan(0);
        });
      }
    }
  });

  it("is solid: a window's frame occupies the space of its glass", () => {
    const frame = prefabs["window-cottage/1"].occupancy.filter((s) => s.path === "frame");
    expect(frame.some((s) => contains(s, 0, 0, 0.1))).toBe(true);
  });

  it("measures each member on its own, so a shutter stays apart from its frame", () => {
    const { occupancy } = prefabs["dormer-cottage-half-shutters/2"];
    const paths = new Set(occupancy.map((s) => s.path));
    expect(paths.has("shutter-0")).toBe(true);
    expect(paths.has("frame")).toBe(true);
  });

  it("matches the frame of a square window to within a few centimetres of its opening", () => {
    const prefab = prefabs["window-cottage/2"];
    const half = (prefab.openings[0].max[0] - prefab.openings[0].min[0]) / 2;
    const frame = prefab.occupancy.filter((s) => s.path === "frame");
    const reach = Math.max(...frame.flatMap((s) => s.hull.map((p) => Math.abs(p[0]))));
    expect(Math.abs(reach - half)).toBeLessThan(0.04);
  });

  it("includes a stone hat, a unit member", () => {
    const paths = new Set(prefabs["door-gothic/1"].occupancy.map((s) => s.path));
    expect(paths.has("hat")).toBe(true);
  });

  it("is laid on the original geometry and read by rules, for parts whose asset declares it", () => {
    const registry = registerHouseTypes(createBuildingRegistry());
    const environment = coreBuildingEnvironment(() => 0, nativeAssets.compilation);
    const size = constructionDecorationType(nativeAssets.compilation.decorations, "window-cottage")!.dimensions[0];
    const draft = buildCoreHouse({
      id: "h",
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      attachments: [
        {
          id: "w",
          kind: "window",
          type: "window-cottage",
          rank: 1,
          u: 0.1,
          bottom: 1,
          width: size.width,
          height: size.height
        }
      ]
    });
    const seen: RuleContext[] = [];
    registry.rules.register("probe", (context) => {
      seen.push(context);
      return {};
    });
    const connections = (draft.connections ?? []).map((c) =>
      c.kind === "attach" && c.guest.includes("/w") ? { ...c, rule: "probe" } : c
    );
    expect(connections.some((c) => c.rule === "probe")).toBe(true);
    designBuildingCore({ ...draft, connections }, registry, { environment });
    expect(seen).toHaveLength(1);
    const { guest, hosts } = seen[0];
    expect(hosts.every((h) => h.occupied.length === 0)).toBe(true);
    expect(guest!.occupied).toHaveLength(1);
    const { matrix, solids } = guest!.occupied[0];
    expect(solids).toBe(prefabs["window-cottage/1"].occupancy);
    // The prefab's middle lands on the mount.
    const mount = guest!.geometry.original.elements.mount;
    if (mount.kind !== "point") throw Error("no mount");
    const { min, max } = prefabs["window-cottage/1"].bounds;
    const middle = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
    for (const k of [0, 1, 2]) {
      const placed = matrix[k] * middle[0] + matrix[4 + k] * middle[1] + matrix[8 + k] * min[2] + matrix[12 + k];
      expect(placed).toBeCloseTo(mount.frame.origin[k] + mount.frame.z[k] * min[2], 5);
    }
  });
});
