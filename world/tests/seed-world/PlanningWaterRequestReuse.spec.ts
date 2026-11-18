import { expect, it } from "vitest";
import { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import { adoptPlanningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/body/WaterBodyAssetRegistry";

function fixture() {
  const assets = new WaterBodyAssetRegistry();
  const runtime = Object.assign(Object.create(PlanningWaterRuntime.prototype), {
    options: { engine: {}, camera: {} },
    requestCache: new Map(),
    oceanVisible: true,
    riversVisible: true,
    system: {
      runtimeHost: {
        assets,
        registerAuthoring: (fn: any) => fn(assets),
        registerAuthoringOnce: (_id: string, _key: string, fn: any) => fn(assets)
      }
    }
  });
  return runtime as any;
}
function plan() {
  const value: any = {
    parameters: { seed: 738194, landMode: "continuous", width: 16, depth: 16 },
    land: [],
    islands: [],
    authoredResources: [],
    planning: { profiles: [{ ownerId: "lake", kind: "water", points: [{ x: 8, y: 1, z: 8 }] }] },
    waters: [
      {
        id: "lake",
        kind: "lake",
        label: "Lake",
        outline: [
          { x: 0, z: 0 },
          { x: 16, z: 0 },
          { x: 16, z: 16 },
          { x: 0, z: 16 }
        ]
      }
    ]
  };
  bed(value, 5, -1);
  return value;
}
function bed(plan: any, resolution: number, height: number) {
  adoptPlanningHeightmap(plan, {
    resolution,
    spacingX: 16 / (resolution - 1),
    spacingZ: 16 / (resolution - 1),
    heights: Float32Array.from({ length: resolution * resolution }, (_, i) => {
      const x = i % resolution,
        z = Math.floor(i / resolution);
      return x === 0 || z === 0 || x === resolution - 1 || z === resolution - 1 ? 8 : height;
    }),
    encoded: new Uint16Array(resolution * resolution),
    decodeOffset: height,
    decodeScale: 1
  });
}
function hashes(requests: any[]) {
  return requests.map((r) => [r.bodyId, r.asset.sourceHash, r.asset.representationDataHash, r.instance]);
}

it("reuses physical requests for identical sources and still applies visibility", async () => {
  const r = fixture(),
    p = plan();
  const first = await r.requests(p);
  const second = await r.requests(p);
  expect(second[0].asset).toBe(first[0].asset);
  expect(hashes(second)).toEqual(hashes(await fixture().requests(p)));
  r.riversVisible = false;
  const hidden = await r.requests(p);
  expect(hidden[0].asset).toBe(first[0].asset);
  expect(hidden[0].instance.visible).toBe(false);
});

it("rechecks in-place source edits, newly adopted beds and removal against fresh compilation", async () => {
  const r = fixture(),
    p = plan();
  const initial = await r.requests(p);
  p.planning.profiles[0].points[0].y = 2;
  const edited = await r.requests(p);
  expect(edited[0].asset.sourceHash).not.toBe(initial[0].asset.sourceHash);
  expect(hashes(edited)).toEqual(hashes(await fixture().requests(p)));
  bed(p, 7, -3);
  const rebedded = await r.requests(p);
  expect(rebedded[0].asset.sourceHash).not.toBe(edited[0].asset.sourceHash);
  expect(hashes(rebedded)).toEqual(hashes(await fixture().requests(p)));
  p.waters = [];
  expect(await r.requests(p)).toEqual([]);
  expect(r.requestCache.size).toBe(0);
});

it("does not treat a partial update as a full-source validation", async () => {
  const r = fixture(),
    p = plan();
  await r.requests(p);
  p.planning.profiles[0].points[0].y = 3;
  await r.requests(p, { bodyId: "lake", surface: false });
  expect(r.requestInputs).toBeUndefined();
  expect(hashes(await r.requests(p))).toEqual(hashes(await fixture().requests(p)));
});
