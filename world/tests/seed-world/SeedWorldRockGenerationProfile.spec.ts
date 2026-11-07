import { expect, it, vi } from "vitest";
import type { IslandPlan } from "../../../packages/world-planning/src/semantic-study/IslandPlanModel.ts";
import { SEMANTIC_DEFAULTS, type SemanticResult } from "../../../packages/world-planning/src/semantic-study/WorldPlanningContract.ts";
import { adoptPlanningHeightmap } from "../../../packages/world-planning/src/semantic-study/PlanningHeightmap.ts";
import { importPlanningDocument } from "../../../packages/world-planning/src/spatial/PlanningDocument.ts";
import { PlanningSession } from "../../../packages/world-planning/src/spatial/PlanningSession.ts";
import { applyRockObbSizes, rockObbId } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/Authoring.ts";
import { readRockGenerationProfile, rockGenerationKind } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/GenerationProfile.ts";

function fixture(count = 12) {
  const recipe = { version: 2 as const, parameters: { ...SEMANTIC_DEFAULTS, seed: 1 }, edits: {} };
  const document = importPlanningDocument(recipe);
  const raw = { parameters: recipe.parameters, land: [], islands: [], mountains: [], buildings: [],
    waters: [], routes: [], regions: [], bridges: [], ridges: [], supports: [], slopes: [], spawn: { x: 0, z: 0 },
    rocks: Array.from({ length: count }, (_, i) => ({ id: `rock-${i}`, groupId: "same-poi", center: { x: i * 60, z: 80 },
      width: 48, height: 36, depth: 40, baseHeight: 12, yaw: 0, role: "wall", outline: [], obb: [],
      boxes: [{ id: `box-${i}`, label: `Box ${i}`, center: { x: i * 60, z: 80 }, elevation: 12,
        sizeX: 48, sizeY: 36, sizeZ: 40, yaw: 0, collision: true, occlusion: true }] })) } as unknown as IslandPlan;
  const ground = { resolution: 2, spacingX: 2048, spacingZ: 2048,
    encoded: new Uint16Array(4), heights: new Float32Array(4), decodeOffset: 0, decodeScale: 1 };
  const compile = (doc = document) => {
    const plan = structuredClone(raw);
    applyRockObbSizes(plan, doc);
    adoptPlanningHeightmap(plan, ground);
    return plan;
  };
  const plan = compile(), result: SemanticResult = { plan, recipe, accepted: true, checks: [], changedIds: [], notes: [] };
  const execute = vi.fn(async () => result);
  const session = new PlanningSession(recipe, execute, document);
  const id = (i: number) => rockObbId(`rock-${i}`, `box-${i}`);
  return { raw, document, compile, plan, result, execute, session, id };
}

it("retains published dimensions at defaults and replays height edits without cumulative scale", () => {
  const f = fixture();
  expect(f.plan.rocks).toEqual(f.raw.rocks);
  f.document.entities.world.components.rockGeneration.values = { platformHeightScale: 1.5 };
  const plan = f.compile();
  for (const rock of plan.rocks) expect(rock.boxes![0].sizeY).toBe(54);
  const before = structuredClone(plan.rocks);
  applyRockObbSizes(plan, f.document);
  expect(plan.rocks).toEqual(before);
  f.document.entities.world.components.rockGeneration.values = {};
  applyRockObbSizes(plan, f.document);
  expect(plan.rocks).toEqual(f.raw.rocks);
});

it("retains stable height-family assignments when sibling count, order and dimensions change", () => {
  const f = fixture(30);
  f.document.entities.world.components.rockGeneration.values = { platformShare: .5 };
  const profile = readRockGenerationProfile(f.document);
  const choices = new Map(f.raw.rocks.map((_, i) => [f.id(i), rockGenerationKind(1, f.id(i), profile)]));
  expect(new Set(choices.values()).size).toBe(2);
  for (const id of [...choices.keys()].reverse()) expect(rockGenerationKind(1, id, profile)).toBe(choices.get(id));
});

it("keeps an individual height authoritative over shared height families through reset and replay", async () => {
  const f = fixture(2); await f.session.initialize();
  expect((await f.session.dispatchParameters([{ op: "set", entity: f.id(0), component: "rockObb", values: { height: 70 } }])).status).toBe("accepted");
  expect((await f.session.dispatchParameters([{ op: "set", entity: "world", component: "rockGeneration", values: { platformHeightScale: 1.5 } }])).status).toBe("accepted");
  expect(f.session.result!.plan.rocks.map(rock => rock.boxes![0].sizeY)).toEqual([70, 54]);
  expect((await f.session.dispatchParameters([{ op: "reset", entity: f.id(0), component: "rockObb" }])).status).toBe("accepted");
  expect(f.session.result!.plan.rocks.map(rock => rock.boxes![0].sizeY)).toEqual([54, 54]);
  expect(f.compile(f.session.export()).rocks).toEqual(f.session.result!.plan.rocks);
  expect(f.execute).toHaveBeenCalledOnce();
});
