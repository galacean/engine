import { expect, it } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  exportPlanningRecipe,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningLayerTree } from "../../demos/seed-world/src/planning/semantic-study/PlanningLayerTree";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";

it("publishes ordered global and internal mandatory points, saves, replays and resets them", async () => {
  const document = createSeedPlanningDocument(17);
  document.entities.world.components.world.values.offshoreCoverage = 0;
  document.entities.world.components.rivers.values.count = 0;
  document.entities.world.components.lakes.values.count = 0;
  const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
  await session.initialize();
  const baseline = session.result!.plan;
  const global = baseline.routes.find((route) => route.id.startsWith("world-route-") && route.points.length > 4)!;
  const internal = baseline.routes.find((route) => !route.id.startsWith("world-route-") && route.points.length > 4)!;
  expect(global).toBeDefined();
  expect(internal).toBeDefined();
  const edits = [global, internal].map((route) => ({
    op: "set" as const,
    entity: route.id,
    component: "roadPath",
    values: {
      keypoints: [0.3, 0.6].map((fraction, index) => ({
        id: `pin-${index}`,
        ...route.points[Math.floor((route.points.length - 1) * fraction)],
        z: route.points[Math.floor((route.points.length - 1) * fraction)].z + (route === global ? 1 : 0)
      }))
    }
  }));
  const receipt = await session.dispatchParameters(edits);
  expect(receipt.status, receipt.message).toBe("accepted");
  for (const edit of edits) {
    const plan = session.result!.plan;
    const route = plan.routes.find((r) => r.id === edit.entity)!;
    expect(route, JSON.stringify(session.result!.checks.filter((c) => c.owners?.includes(edit.entity)))).toBeDefined();
    let previous = -1;
    for (const pin of edit.values.keypoints) {
      const index = route.points.findIndex(
        (point, i) => i >= previous && Math.hypot(point.x - pin.x, point.z - pin.z) < 1e-4
      );
      expect(index).toBeGreaterThanOrEqual(previous);
      expect(index).toBeGreaterThanOrEqual(0);
      previous = index;
      expect(
        plan.roadGraph!.sections.some(
          (section) =>
            section.owners.includes(route.id) &&
            section.route.points.some((p) => Math.hypot(p.x - pin.x, p.z - pin.z) < 1e-4)
        )
      ).toBe(true);
      expect(
        route.navigationLinks!.some((link) => link.points.some((p) => Math.hypot(p.x - pin.x, p.z - pin.z) < 1e-4))
      ).toBe(true);
    }
  }
  const edited = session.result!.plan;
  expect(edited.routes.find((route) => route.id === global.id)!.points).not.toEqual(global.points);
  expect(edited.spatialLayout!.landscapeBase!.signature).toContain(
    JSON.stringify(edited.routes.map((r) => [r.id, r.outline]))
  );
  for (const guidance of edited.visualGuidance ?? []) {
    const road = edited.routes.find((route) => route.id === guidance.sourceId);
    if (road) expect(guidance.points).toEqual(road.points);
  }
  const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(session.export())));
  const replay = new PlanningSession(exportPlanningRecipe(saved), undefined, saved);
  await replay.initialize();
  expect(replay.result!.plan.routes).toEqual(edited.routes);
  expect(replay.result!.plan.roadGraph).toEqual(edited.roadGraph);
  expect(replay.result!.plan.landscapes).toEqual(edited.landscapes);
  expect(replay.result!.plan.flowerRegions).toEqual(edited.flowerRegions);
  expect(replay.result!.plan.visualGuidance).toEqual(edited.visualGuidance);
  const invalid = await session.dispatchParameters([
    {
      op: "set",
      entity: global.id,
      component: "roadPath",
      values: { keypoints: [{ id: "sea", x: 100000, z: 100000 }] }
    }
  ]);
  expect(invalid.status, invalid.message).toBe("accepted");
  expect(session.result!.plan.routes.some((r) => r.id === global.id)).toBe(false);
  expect(session.result!.plan.roadGraph!.sections.some((s) => s.owners.includes(global.id))).toBe(false);
  expect(session.scene!.entities.get(global.id)?.kind).toBe("globalRoute");
  expect(session.scene!.entities.get(global.id)?.components.authoredRoadPath.keypoints).toEqual([
    { id: "sea", x: 100000, z: 100000 }
  ]);
  expect(session.result!.checks.some((c) => c.rule === "authored-road-path" && c.owners?.includes(global.id))).toBe(
    true
  );
  const hierarchy = planningLayerTree(session.result!.plan, session.scene!);
  expect(hierarchy.find((node) => node.id === "roads")!.children!.some((node) => node.focusId === global.id)).toBe(true);
  const failedSaved = upgradePlanningDocument(JSON.parse(JSON.stringify(session.export())));
  const failedReplay = new PlanningSession(exportPlanningRecipe(failedSaved), undefined, failedSaved);
  await failedReplay.initialize();
  expect(planningLayerTree(failedReplay.result!.plan, failedReplay.scene!).find((node) => node.id === "roads")!.children!.some((node) => node.focusId === global.id)).toBe(true);
  expect(failedReplay.inspect(global.id).components.find((component) => component.type === "roadPath")!.values.keypoints).toEqual([{id:"sea",x:100000,z:100000}]);
  const invalidInternal = await session.dispatchParameters([
    { op: "set", entity: internal.id, component: "roadPath", values: { keypoints: [{ id: "sea", x: 100000, z: 100000 }] } }
  ]);
  expect(invalidInternal.status, invalidInternal.message).toBe("accepted");
  expect(session.result!.plan.routes.some((route) => route.id === internal.id)).toBe(false);
  expect(session.scene!.entities.get(internal.id)?.kind).toBe("route");
  expect(session.inspect(internal.id).components.find((component) => component.type === "roadPath")!.values.keypoints)
    .toEqual([{ id: "sea", x: 100000, z: 100000 }]);
  const repairInternal = await session.dispatchParameters([edits[1]]);
  expect(repairInternal.status, repairInternal.message).toBe("accepted");
  expect(session.result!.plan.routes.some((route) => route.id === internal.id)).toBe(true);
  expect(session.inspect(internal.id).components.find((component) => component.type === "roadPath")!.values.keypoints)
    .toEqual(edits[1].values.keypoints);
  await session.dispatchParameters([
    { op: "set", entity: internal.id, component: "roadPath", values: { keypoints: [{ id: "sea", x: 100000, z: 100000 }] } }
  ]);
  expect(session.inspect(internal.id).components.some((component) => component.type === "roadWidth")).toBe(true);
  const reset = await session.dispatchParameters(
    edits.map((edit) => ({ op: "reset", entity: edit.entity, component: "roadPath", fields: ["keypoints"] }))
  );
  expect(reset.status, reset.message).toBe("accepted");
  expect(session.result!.plan.routes).toEqual(baseline.routes);
  expect(session.result!.plan.roadGraph).toEqual(baseline.roadGraph);
}, 180000);
