import { expect, it, vi } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  planningSurfacePublicationGate,
  planningWaterImpactBounds,
  preparePlanningWaterImpact
} from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterPublication";
import type { PublishedPlanningSeedScene } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";

it("admits real terrain patch addition/removal while retaining global-owner and mixed-edit guards", async () => {
  const initial = createSeedPlanningDocument(1);
  const session = new PlanningSession(exportPlanningRecipe(initial), undefined, initial);
  await session.initialize();
  const before = session.export(),
    base = session.result!;
  expect(base.accepted).toBe(true);
  const previous = {
    plan: base.plan,
    vegetation: {},
    data: { surfaceIntent: { riverBedCoverage: new Uint8Array(1) } }
  } as PublishedPlanningSeedScene;
  const after = structuredClone(before);
  const point = { x: base.plan.spawn.x - 8, z: base.plan.spawn.z + 20 };
  after.authoredResources = [
    {
      resourceId: "local",
      resourceType: "terrain-patch",
      properties: { ...point, radiusMetres: 20, heightDeltaMetres: 1 }
    }
  ];
  expect((await session.load(after)).status).toBe("accepted");
  const result = session.result!;
  expect(result.accepted).toBe(true);
  expect(planningSurfacePublicationGate(previous, before, after, result)).toBeUndefined();
  const a = planningHeightmap(base.plan),
    b = planningHeightmap(result.plan);
  expect(b.sample(point)).not.toBe(a.sample(point));
  const bounds = planningWaterImpactBounds(previous, result.plan);
  // Every changed height sample and its interpolation neighbourhood must be included.
  let changed = 0;
  for (let z = 0; z < b.resolution; z++)
    for (let x = 0; x < b.resolution; x++) {
      if (a.heights[z * a.resolution + x] === b.heights[z * b.resolution + x]) continue;
      changed++;
      expect(bounds.minimumX).toBeLessThanOrEqual(Math.max(0, (x - 1) * b.spacingX));
      expect(bounds.maximumX).toBeGreaterThanOrEqual(Math.min(result.plan.parameters.width, (x + 1) * b.spacingX));
      expect(bounds.minimumZ).toBeLessThanOrEqual(Math.max(0, (z - 1) * b.spacingZ));
      expect(bounds.maximumZ).toBeGreaterThanOrEqual(Math.min(result.plan.parameters.depth, (z + 1) * b.spacingZ));
    }
  expect(changed).toBeGreaterThan(0);
  expect(planningSurfacePublicationGate({ ...previous, plan: result.plan }, after, before, base)).toBeUndefined();
  expect(planningSurfacePublicationGate(previous, before, after, result, true)).toBe("projection-out-of-sync");
  const mixed = structuredClone(after);
  mixed.authoredResources!.push({
    resourceId: "remove",
    resourceType: "object-removal",
    properties: { objectId: "unrelated", kind: "tree" }
  } as any);
  expect(planningSurfacePublicationGate(previous, before, mixed, result)).toBe("mixed-non-surface-intent");
  for (const key of [
    "routes",
    "roadGraph",
    "roadNetwork",
    "bridges",
    "roadApproaches",
    "buildings",
    "rocks",
    "fences",
    "courtyards",
    "farming"
  ] as const) {
    const plan = { ...result.plan, [key]: ["changed"] };
    expect(planningSurfacePublicationGate(previous, before, after, { ...result, plan } as any)).toBe(
      "changed-global-owner:" + key
    );
    const capable = { ...previous, world: { exactPrefabs: { exactInstances: [] } } } as any;
    const admitted = planningSurfacePublicationGate(
      capable,
      before,
      after,
      { ...result, plan } as any,
      false,
      undefined,
      true
    );
    if (["buildings", "fences", "courtyards", "farming"].includes(key))
      expect(admitted).toBe("changed-global-owner:" + key);
    else expect(admitted).toBeUndefined();
  }
  expect(
    planningSurfacePublicationGate({ ...previous, masonry: { terrainEditPending: true } } as any, before, after, result)
  ).toBe("masonry-edit-active");
  expect(planningSurfacePublicationGate({ ...previous, template: {} } as any, before, after, result)).toBe(
    "template-terrain-owner"
  );
  expect(
    planningSurfacePublicationGate(
      { ...previous, world: { exactPrefabs: { exactInstances: [{}] } } } as any,
      before,
      after,
      result
    )
  ).toBe("exact-prefab-terrain-owner");
  expect(
    planningSurfacePublicationGate(
      {
        ...previous,
        heightTransition: { fields: { heightSamples: new Uint16Array(1) } },
        data: { fields: { heightSamples: new Uint16Array(1) } }
      } as any,
      before,
      after,
      result
    )
  ).toBe("terrain-transition-active");
  expect(
    planningSurfacePublicationGate(previous, before, after, {
      ...result,
      plan: { ...result.plan, parameters: { ...result.plan.parameters, width: result.plan.parameters.width * 2 } }
    })
  ).toBe("world-lattice-changed");
  expect(
    planningSurfacePublicationGate(previous, before, after, {
      ...result,
      plan: { ...result.plan, landscapes: [{ kind: "rock", id: "changed" }] }
    } as any)
  ).toBe("changed-global-owner:landscape-rocks");
  const empty = { ...result.plan, buildings: [], fences: [], courtyards: [] };
  expect(planningSurfacePublicationGate(previous, before, after, { ...result, plan: empty }, false, 1)).toBe(
    "terrain-transition-requested"
  );
}, 120000);

it("waits for the Raster worker before reading or baking candidate height samples", async () => {
  const failure = Error("worker cancelled");
  const raster = { run: vi.fn().mockRejectedValue(failure) };
  // No prepared heightmap exists yet. Preparation must propagate the worker failure,
  // without trying to compile either of these intentionally unavailable input maps.
  await expect(
    preparePlanningWaterImpact(
      {
        revision: 0,
        world: { getSurfaceReliefTuning: () => ({ maskCoverageStart: 0, maskSoftnessMetres: 0.5 }) }
      } as any,
      { plan: {} } as any,
      raster as any,
      new AbortController().signal,
      1
    )
  ).rejects.toBe(failure);
  expect(raster.run).toHaveBeenCalledOnce();
});
