import { masonryTerrainSource } from "@galacean/engine-world-planning/masonry/MasonryPlacement.ts";
import { constructionTerrainHeight } from "@galacean/engine-building/tiny-glade/runtime/TerrainField.ts";
import { setImmediate as yieldToRunner } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization.ts";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument.ts";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime.ts";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession.ts";
import { planningResourceSnapshot } from "@galacean/engine-world-planning/spatial/PlanningResources.ts";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap.ts";
import { planningAlphamap } from "@galacean/engine-world-planning/semantic-study/PlanningAlphamap.ts";
import { compilePlanningSeedWorldData } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedWorldData.ts";
import { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";
import { SeedWorldPlanningService } from "../../demos/seed-world/agent-adapter/SeedWorldPlanningService";
import type { SeedWorldEnginePort } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort.ts";
import { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime.ts";
import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields.ts";
import { preparePlanningTerrainPresentation } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningTerrainPresentation";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel.ts";
import { state } from "../../../packages/world-planning/tests/editor/seed-world-fixture";

vi.hoisted(() => Object.defineProperty(globalThis, "window", { value: {}, configurable: true }));

function terrainRuntime() {
  const runtime = Object.create(SeedWorldTerrainRuntime.prototype) as SeedWorldTerrainRuntime;
  Object.assign(runtime, { clipmap: { updateHeightRegion: vi.fn(), updateHeightRegionFrame: vi.fn() },
    population: { applyAuthoringHeightFrame: vi.fn() }, applyAuthoringHeightPatch: vi.fn() });
  return runtime;
}
function fields(plan: IslandPlan): SeedWorldFields {
  return compilePlanningSeedWorldData(plan, { height: planningHeightmap(plan), alpha: planningAlphamap(plan) }).fields;
}

it("publishes terrain.create with the final immutable native building terrain field", async () => {
  const initial = createSeedPlanningDocument(1);
  let prepared: { plan: IslandPlan; duration?: number } | undefined;
  const session = new PlanningSession(exportPlanningRecipe(initial), async (document, previous) =>
    generatePlanningDocument(document, previous), initial, {
    preparePublication: async (_document, result, context) => {
      prepared = { plan: result.plan, duration: context.terrainTransitionDurationSeconds };
      return { commit() {}, discard() {} };
    }
  });
  await session.initialize();
  await yieldToRunner();
  const before = fields(session.result!.plan);
  await yieldToRunner();
  const base = { readWorldState: state, readAuthoringSnapshot: () => planningResourceSnapshot(session.document),
    queryWorldObjects: () => ({ worldId: "seed-world-1", worldRevision: session.document.revision, inspectedObjectCount: 0, objects: [] }),
    resolveSpatialTarget: () => ({ geometry: "point", position: [500, 0, 500],
      anchor: { kind: "position" }, relation: { kind: "at" }, worldRevision: session.document.revision })
  } as unknown as SeedWorldEnginePort;
  const application = new SeedWorldAgentApplication(base, new SeedWorldPlanningService(session, () => {}));
  const signal = new AbortController().signal, transaction = application.beginEdit("terrain-contact", signal);
  try {
    const tool = transaction.tools.find(tool => tool.name === "terrain.create")!;
    const input = tool.parseInput({ kind: "plateau", target: { anchor: { kind: "position", x: 500, y: 0, z: 500 },
      relation: { kind: "at" }, placement: { snapTo: "none", collision: "allow" } },
      lengthMetres: 120, widthMetres: 120, heightMetres: 10, roughness: 0, erosion: 0 });
    expect(tool.parseOutput(await tool.execute(input, { signal }))).toMatchObject({ status: "applied" });
    await transaction.prepare(signal);
    await transaction.commit(signal);
    await transaction.activate(signal);
    expect(prepared!.duration).toBe(1);
    const plan = prepared!.plan, next = fields(plan), runtimeFields = { ...next };
    await yieldToRunner();
    // Native buildings consume the final immutable published field. Production
    // disables the terrain animation when buildings are present.
    const runtime = terrainRuntime();
    expect(preparePlanningTerrainPresentation(runtime, before, next, runtimeFields, undefined)).toBeUndefined();
    const source = masonryTerrainSource({ revision: 1, data: { fields: next } });
    const finalGround = constructionTerrainHeight(source.grid, 500, 500);
    const oldGround = sampleSeedWorldHeight(before, 500, 500)!;
    expect(Math.abs(finalGround - oldGround)).toBeGreaterThan(1);
    // Native height data is R16; bound quantization error by one encoded step.
    expect(Math.abs(finalGround - sampleSeedWorldHeight(next, 500, 500)!)).toBeLessThanOrEqual(source.grid.decode.scale / 65535);
    expect(source.grid.samples).toEqual(next.heightSamples);
    expect(source.grid.samples).not.toBe(next.heightSamples);
  } finally { await transaction.discard?.(); }
}, 120000);
