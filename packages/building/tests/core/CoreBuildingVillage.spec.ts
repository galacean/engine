vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { expect, it, vi } from "vitest";
import { nativeAssets } from "../fixtures/constructionAssets";
import { createBuildingRegistry, designBuildingCore } from "../../src/building/core";
import { registerHouseTypes } from "../../src/building/partTypes/House";
import { buildCoreHouse } from "../../src/building/application/CoreEuropean";
import { prepareCoreBuilding, compileCoreBuilding } from "../../src/building/render/CoreBuilding";
import { frozen } from "./baseline";
import { buildBuildingRenderPackage } from "../../src/building/runtime/BuildingRenderPackage";
import { buildingGlobals } from "../../src/building/runtime/BuildingGlobals";
const roofs = [{}, { ridge_length: 1 }, { height: 0.8 }, { height: 0 }, { ridge_length: 0.3, height: 0.5 }];
const village = Array.from({ length: 17 }, (_, i) => ({
  id: `h${i}`,
  seed: i * 7 + 1,
  height: 3.5 + (i % 3),
  rectangle: { center: [(i % 6) * 14, Math.floor(i / 6) * 14], size: [7 + (i % 4), 5 + (i % 3)], rotation: i * 0.2 },
  roof: roofs[i % roofs.length]
})) as any[];
const flat = () => 0;
// Online paves a flat roof with roof tiles; the comparison lays the same unit.
const asOnline = (h: any) => (h.roof?.height === 0 ? { ...h, roofUnit: "roof_tile" } : h);
async function time<T>(f: () => Promise<T> | T, runs = 3) {
  let best = Infinity,
    out!: T;
  for (let k = 0; k < runs; k++) {
    const t = performance.now();
    out = await f();
    best = Math.min(best, performance.now() - t);
  }
  return { ms: best, out };
}
/** The online path's output sizes for this village, and its times on the machine that froze them. */
const online = frozen<{
  units: number;
  unitBytes: number;
  draws: number;
  previewTriangles: number;
  distanceTextureBytes: number;
  structureTriangles: number;
  retainedDistanceUnits: number;
  documentBytes: number;
  ms: { prepare: number; compile: number; package: number };
}>("CoreBuildingVillage");
// Village benchmark of the core render path against the online path's frozen output. Times are
// printed for the acceptance record; the assertions check the output sizes, which do not depend
// on the machine.
it("renders a village with the same draws and comparable output to the online path", async () => {
  const registry = registerHouseTypes(createBuildingRegistry());
  const env = { environment: { ground: flat }, assets: nativeAssets };
  const coPrep = await time(() =>
    village.map(
      (h) =>
        prepareCoreBuilding(
          designBuildingCore(buildCoreHouse(asOnline(h)), registry, { environment: { ground: flat } }),
          registry,
          env
        ).preview
    )
  );
  const coComp = await time(async () => {
    const r = [];
    for (const h of village)
      r.push(
        (
          await compileCoreBuilding(
            designBuildingCore(buildCoreHouse(asOnline(h)), registry, { environment: { ground: flat } }),
            registry,
            env
          )
        ).renderInput
      );
    return r;
  });
  const pk = (inputs: any[]) =>
    inputs.map(
      (i) =>
        buildBuildingRenderPackage(i, nativeAssets, buildingGlobals(i.paletteSlots, nativeAssets.frame), true).package
    );
  const coPk = await time(() => pk(coComp.out), 2);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const unitBytes = (inputs: any[]) =>
    sum(inputs.flatMap((i) => i.groups.map((g: any) => sum(Object.values(g.units).map((u: any) => u.byteLength)))));
  const cells = (inputs: any[]) => sum(inputs.map((i) => sum(i.groups.map((g: any) => g.cells.length))));
  const draws = (ps: any[]) => sum(ps.map((p) => p.draws.length));
  const previewTris = (vs: any[]) => sum(vs.map((v) => sum(v.parts.map((p: any) => p.indices.length / 3))));
  const lodBytes = (vs: any[]) =>
    sum(vs.map((v) => sum(v.parts.map((p: any) => p.lodAppearance?.pixels.byteLength ?? 0))));
  const structTris = (vs: any[]) => sum(vs.map((v) => sum(v.structuralParts.map((p: any) => p.indices.length / 3))));
  const retained = (vs: any[]) => sum(vs.map((v) => sum(v.retainedWallUnits.map((r: any) => r.cells.length))));
  const docBytes = (inputs: any[]) =>
    sum(inputs.map((i) => JSON.stringify(i.placementDocument).length + JSON.stringify(i.plans).length));
  const row = (k: string, a: any, b: any) =>
    console.log("PERF", k.padEnd(28), String(a).padStart(12), String(b).padStart(12));
  row("", "online (frozen)", "core");
  row("prepare ms (17 houses)", online.ms.prepare, coPrep.ms.toFixed(1));
  row("compile ms", online.ms.compile, coComp.ms.toFixed(1));
  row("package ms", online.ms.package, coPk.ms.toFixed(1));
  row("units", online.units, cells(coComp.out));
  row("unit record bytes", online.unitBytes, unitBytes(coComp.out));
  row("draws", online.draws, draws(coPk.out));
  row("preview triangles", online.previewTriangles, previewTris(coPrep.out));
  row("distance texture bytes", online.distanceTextureBytes, lodBytes(coPrep.out));
  row("structure triangles", online.structureTriangles, structTris(coPrep.out));
  row("retained distance units", online.retainedDistanceUnits, retained(coPrep.out));
  row("document+plans bytes", online.documentBytes, docBytes(coComp.out));
  expect(draws(coPk.out)).toBe(online.draws);
  expect(Math.abs(cells(coComp.out) - online.units) / online.units).toBeLessThan(0.05);
  expect(lodBytes(coPrep.out)).toBeLessThan(online.distanceTextureBytes * 1.1);
  expect(previewTris(coPrep.out)).toBeLessThan(online.previewTriangles * 1.2);
}, 600000);
