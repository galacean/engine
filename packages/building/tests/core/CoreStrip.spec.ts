// Acceptance of free-standing walls and fences on the core render path against what the online
// path drew, frozen in baselines/CoreStrip.json.
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { describe, expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { designBuildingCore } from "../../src/building/core";
import { createBuildingTypeRegistry } from "../../src/building/partTypes";
import { buildCoreFence, buildCoreWall, type CoreStripParameters } from "../../src/building/application/CoreEuropean";
import { compileCoreBuilding, prepareCoreBuilding } from "../../src/building/render/CoreBuilding";
import { baseline } from "./baseline";

const registry = createBuildingTypeRegistry();
const flat = () => 0;
const hills = (x: number, z: number) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
const CASES: [string, "wall" | "fence", CoreStripParameters, (x: number, z: number) => number][] = [
  ["wall", "wall", { id: "a" }, flat],
  ["fence", "fence", { id: "a" }, flat],
  ["rotated wall", "wall", { id: "a", length: 11, height: 2.2, center: [1, -2], rotation: 0.7 }, flat],
  ["wall on hills", "wall", { id: "a" }, hills],
  ["fence on hills", "fence", { id: "a", length: 9 }, hills]
];
/** Online's draw roles, its units that fit the core's ranges, and the box of its unit centers. */
const ONLINE = baseline<{ roles: string[]; units: number; box: number[] }>("CoreStrip");
describe("Free-standing walls and fences against the online path", () => {
  it.each(CASES)("%s: the same draws, about the same units and the same extent", async (name, kind, p, ground) => {
    const online = ONLINE[name];
    const result = designBuildingCore(kind === "wall" ? buildCoreWall(p) : buildCoreFence(p), registry, {
      environment: { ground }
    });
    expect(result.diagnostics).toEqual([]);
    const options = { environment: { ground }, assets: nativeAssets.compilation };
    const { renderInput } = await compileCoreBuilding(result, registry, options);
    // The core leaves out pieces too small for the unit's range, such as a course a centimetre
    // high under the wall top; the online path keeps them.
    const fits = (c: { size: number[] }) => c.size[0] >= 0.025 && c.size[1] >= 0.022;
    const count = renderInput.groups.reduce((n, g) => n + g.cells.filter(fits).length, 0);
    expect(renderInput.groups.map((g) => g.role)).toEqual(online.roles);
    expect(Math.abs(count - online.units) / online.units).toBeLessThan(0.12);
    // Every unit lies where the online units lie: the two clouds of centers share their box.
    const box = (input: typeof renderInput) => {
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      for (const g of input.groups)
        for (const c of g.cells)
          for (let a = 0; a < 3; a++) {
            min[a] = Math.min(min[a], c.center[a]);
            max[a] = Math.max(max[a], c.center[a]);
          }
      return [...min, ...max];
    };
    const [a, b] = [online.box, box(renderInput)];
    a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(0.3));
    // The distance view has a part to draw.
    expect(prepareCoreBuilding(result, registry, options).preview.parts.length).toBeGreaterThan(0);
  });
});
