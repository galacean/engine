import { expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSpatialWorldBase } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { isGlobalRoadSurface } from "@galacean/engine-world-planning/spatial/layout/RoadTopology";
import { publishRoadPath } from "@galacean/engine-world-planning/spatial/layout/RoadGeometry";
import { planningVectorSurface } from "@galacean/engine-world-planning/semantic-study/PlanningVectorSurface";
import { planningTerrainSource } from "@galacean/engine-world-planning/semantic-study/PlanningTerrainSource";
import { compilePlanningScene } from "@galacean/engine-world-planning/semantic-study/WorldPlanningScene";

function fixture() {
  const plan = createSpatialWorldBase(exportPlanningRecipe(createSeedPlanningInputs(1)));
  plan.land = [{ x: 0, z: 0 }, { x: 1024, z: 0 }, { x: 1024, z: 1024 }, { x: 0, z: 1024 }];
  plan.poiDistribution = { sites: [] } as unknown as NonNullable<typeof plan.poiDistribution>;
  const owners = [["world-route-a", "world-route-b"], ["poi-a:path:0"], ["road-attachment:a", "poi-a:path:1"]];
  const sections = owners.map((owners, i) => {
    const id = `road-section:${i}`;
    return { id, owners, route: publishRoadPath({ id, from: `a${i}`, to: `b${i}`, width: 12 }, [
      { x: 400, z: 400 + i * 50 }, { x: 600, z: 400 + i * 50 }
    ]) };
  });
  plan.roadGraph = { nodes: [], sections };
  plan.routes = sections.flatMap((section) => section.owners.map((id) => ({ ...section.route, id })));
  return plan;
}

it("classifies physical sections by global, attachment and shared ownership in vector and whitebox views", () => {
  const plan = fixture();
  expect(plan.roadGraph!.sections.map((s) => isGlobalRoadSurface(plan, s.route))).toEqual([true, false, true]);
  const vector = planningVectorSurface(plan);
  const global = vector.split('<g data-plan-layer="road-world">')[1];
  expect(global).toContain('object:road-section:0');
  expect(global).toContain('object:road-section:2');
  expect(global).not.toContain('object:road-section:1');
  expect(global).toContain('data-route-owners="world-route-a world-route-b"');
  const parts = compilePlanningScene(plan).filter((p) => p.id.startsWith("road-section:"));
  expect(parts.map((p) => p.layer)).toEqual(["road-world", "road-local", "road-world"]);
  expect(parts.map((p) => p.owners)).toEqual(plan.roadGraph!.sections.map((s) => s.owners));
});

it("removes hidden global pavement from terrain while retaining local roads and visible shared owners", () => {
  const plan = fixture();
  const soil = (flags: Record<string, boolean>, z: number) => {
    const source = planningTerrainSource(plan, flags);
    const map = source.layers.alphamaps[0];
    const col = Math.round((500 / 1024) * (map.sampleSize[0] - 1));
    const row = Math.round((z / 1024) * (map.sampleSize[1] - 1));
    return map.weights[(row * map.sampleSize[0] + col) * 4 + 1];
  };
  expect(soil({}, 400)).toBeGreaterThan(200);
  expect(soil({ "road-world": false }, 400)).toBe(0);
  expect(soil({ "road-world": false }, 450)).toBeGreaterThan(200);
  expect(soil({ "road-world": false }, 500)).toBe(0);
  expect(soil({ "object:world-route-a": false }, 400)).toBeGreaterThan(200);
  expect(soil({ "object:world-route-a": false, "object:world-route-b": false }, 400)).toBe(0);
  expect(soil({ route: false }, 450)).toBe(0);
});
