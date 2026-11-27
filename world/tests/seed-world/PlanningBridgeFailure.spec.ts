import { expect, it, vi } from "vitest";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { publishRoadPath } from "@galacean/engine-world-planning/spatial/layout/RoadGeometry";
import { rebuildRoadTopology } from "@galacean/engine-world-planning/spatial/layout/RoadTopology";
import {
  captureBridgeRoadBaseline,
  publishPlanningSuspensionBridges
} from "@galacean/engine-world-planning/spatial/hydrology/PlanningSuspensionBridges";

vi.mock("@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain", async (original) => ({
  ...(await original<object>()),
  createPlanningGroundSampler: () => () => 0
}));

it("reports a failed bridge without rejecting the world or retaining its navigable crossing", () => {
  const crossing = publishRoadPath({ id: "crossing", from: "a", to: "b", width: 3 }, [
    { x: 0, z: 0 },
    { x: 30, z: 0 }
  ]);
  const unrelated = publishRoadPath({ id: "unrelated", from: "c", to: "d", width: 3 }, [
    { x: 100, z: 0 },
    { x: 130, z: 0 }
  ]);
  const plan = {
    routes: [crossing, unrelated],
    bridges: [],
    waters: [],
    roadApproaches: [],
    parameters: { width: 200, depth: 200 },
    roadNetwork: { nodes: [], domains: [], edges: [{ routeId: "crossing" }, { routeId: "unrelated" }] }
  } as unknown as IslandPlan;
  rebuildRoadTopology(plan, () => true);
  const sectionIds = plan.roadGraph!.sections.filter((s) => s.owners.includes("crossing")).map((s) => s.id);
  plan.bridges = [
    {
      id: "bridge",
      label: "Bridge",
      a: { x: 0, z: 0 },
      b: { x: 30, z: 0 },
      width: 3,
      routeId: "crossing",
      roadSectionIds: sectionIds,
      riverId: "water"
    }
  ];
  const baseline = captureBridgeRoadBaseline(plan);
  const snapshot = JSON.stringify(baseline);
  const checks = publishPlanningSuspensionBridges(plan, baseline, {}, { bridge: { towerHeightM: 0 } }, () => true);
  expect(checks.some((c) => c.status === "fail")).toBe(true);
  expect(checks.some((c) => c.status === "fail" && c.required)).toBe(false);
  expect(plan.bridges).toEqual([]);
  expect(plan.roadApproaches).toEqual([]);
  expect(plan.routes.map((r) => r.id)).toEqual(["unrelated"]);
  expect(plan.roadGraph!.sections.some((s) => sectionIds.includes(s.id))).toBe(false);
  expect(plan.roadNetwork!.edges.map((e) => e.routeId)).toEqual(["unrelated"]);
  expect(JSON.stringify(baseline)).toBe(snapshot);
});
