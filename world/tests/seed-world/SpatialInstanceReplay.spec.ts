import { expect, it } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  exportPlanningRecipe,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";

it("replays and resets a real village member edit with identical roads and navigation", async () => {
  const document = createSeedPlanningDocument(17);
  document.entities.world.components.world.values.offshoreCoverage = 0;
  document.entities.world.components.rivers.values.count = 0;
  document.entities.world.components.lakes.values.count = 0;
  const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
  await session.initialize();
  const baseline = session.result!.plan;
  const pair = baseline.spatialLayout!.groups.flatMap((group) =>
    group.volumes.flatMap((volume) => {
      const port = group.ports.find((p) => p.id === `${volume.id}:port` || p.servesVolumeId === volume.id);
      return port &&
        baseline.routes.some((r) =>
          r.points.some((p) => Math.hypot(p.x - port.position.x, p.z - port.position.z) < 1e-3)
        )
        ? [{ volume, port }]
        : [];
    })
  )[0];
  expect(pair).toBeDefined();
  const receipt = await session.dispatchParameters([
    { op: "set", entity: pair.volume.id, component: "solid", values: { x: pair.volume.boxes[0].center.x + 2 } }
  ]);
  expect(receipt.status, receipt.message).toBe("accepted");
  const edited = session.result!.plan;
  expect(
    edited.spatialLayout!.groups.flatMap((g) => g.ports).find((p) => p.id === pair.port.id)!.position.x
  ).toBeCloseTo(pair.port.position.x + 2, 7);
  expect(edited.spatialLayout!.landscapeBase!.signature).toContain(
    JSON.stringify(edited.routes.map((route) => [route.id, route.outline]))
  );
  for (const guidance of edited.visualGuidance ?? []) {
    expect(guidance.points).toEqual(edited.routes.find((route) => route.id === guidance.sourceId)?.points);
  }
  const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(session.export())));
  const replay = new PlanningSession(exportPlanningRecipe(saved), undefined, saved);
  await replay.initialize();
  expect(replay.result!.plan.routes).toEqual(edited.routes);
  expect(replay.result!.plan.roadGraph).toEqual(edited.roadGraph);
  expect(replay.result!.plan.roadNetwork).toEqual(edited.roadNetwork);
  expect(replay.result!.plan.landscapes).toEqual(edited.landscapes);
  expect(replay.result!.plan.flowerRegions).toEqual(edited.flowerRegions);
  expect(replay.result!.plan.visualGuidance).toEqual(edited.visualGuidance);
  const reset = await session.dispatchParameters([
    { op: "reset", entity: pair.volume.id, component: "solid", fields: ["x"] }
  ]);
  expect(reset.status, reset.message).toBe("accepted");
  expect(session.result!.plan.routes).toEqual(baseline.routes);
  expect(session.result!.plan.roadGraph).toEqual(baseline.roadGraph);
}, 120000);
