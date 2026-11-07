import { expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { generatePlanningDocument, editableEntity } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { resolveComponent } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { projectAuthoredRocks } from "@galacean/engine-world-planning/spatial/layout/AuthoredRocks";
import { applySpatialSceneryEdits } from "@galacean/engine-world-planning/spatial/layout/SpatialInstanceEdits";
import { envelope } from "@galacean/engine-world-planning/semantic-study/IslandPlanAtoms";
import { createSpatialWorldBase } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  readRockFormationSettings,
  rockSettingsForJob,
  rockGeometrySettings
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { rockObbId } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Authoring";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset";

it("initializes six separated ridge-shaped solids outside the map, with reproducible independent author parameters", () => {
  const document = createSeedPlanningInputs(1);
  const mountains = Object.values(document.entities).filter((e) => e.origin === "authored");
  expect(mountains).toHaveLength(6);
  expect(document).toEqual(createSeedPlanningInputs(1));
  expect(document).not.toEqual(createSeedPlanningInputs(7));
  for (const mountain of mountains) {
    const s = mountain.components.solid.values as Record<string, number>;
    const points = envelope({ x: s.x, z: s.z }, s.width, s.depth, (s.yawDegrees * Math.PI) / 180);
    expect(["x", "z"].some((axis) => points.every((p) => p[axis] < 0) || points.every((p) => p[axis] > 1024))).toBe(
      true
    );
    expect(s.width / s.depth).toBeGreaterThan(3.5);
    expect(s.width / s.height).toBeGreaterThan(2.5);
    const shape = rockSettingsForJob(readRockFormationSettings(document), rockObbId(mountain.id, mountain.id));
    expect(shape.shape.topSlope).toBeGreaterThan(0);
    expect(shape.shape.topSlope).toBeLessThan(10);
    expect(shape.shape.topScale).toBeGreaterThanOrEqual(0.08);
    expect(shape.shape.topScale).toBeLessThan(0.2);
    expect(shape.shape.topRoughness).toBeGreaterThan(0);
    expect(shape.variation).toBe(0);
  }
  const restored = importPlanningScene(exportPlanningScene(document));
  for (const mountain of mountains) expect(restored.entities[mountain.id]).toEqual(mountain);
});

it("projects editable solids without accumulating copies, and preserves move/resize/remove through replay", () => {
  const document = createSeedPlanningInputs(1);
  const plan = createSpatialWorldBase(exportPlanningRecipe(document));
  projectAuthoredRocks(plan, document, () => 12);
  expect(plan.rocks.filter((r) => r.authored)).toHaveLength(6);
  const id = "backdrop-0-0";
  Object.assign(document.entities[id].components.solid.values, { x: -1800, height: 700, elevation: -60 });
  projectAuthoredRocks(plan, document, () => 12);
  expect(plan.rocks.find((r) => r.id === id)).toMatchObject({ center: { x: -1800 }, height: 700, baseHeight: -60 });
  delete document.entities[id];
  projectAuthoredRocks(plan, document, () => 12);
  expect(plan.rocks.filter((r) => r.authored)).toHaveLength(5);
  expect(plan.rocks.some((r) => r.id === id)).toBe(false);
});

it("publishes distant rocks through the normal planner without changing roads, buildings or terrain", () => {
  const document = createSeedPlanningInputs(1);
  const bare = structuredClone(document);
  for (const [id, entity] of Object.entries(bare.entities)) if (entity.origin === "authored") delete bare.entities[id];
  const a = generatePlanningDocument(bare, undefined, [], undefined, { environment: false });
  const b = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  expect(b.accepted).toBe(true);
  expect(b.plan.rocks.filter((r) => r.authored)).toHaveLength(6);
  expect(b.plan.rocks.filter((r) => !r.authored)).toEqual(a.plan.rocks);
  for (const key of ["buildings", "routes", "waters", "spawn", "land", "poiDistribution"] as const)
    expect(b.plan[key], key).toEqual(a.plan[key]);
  const rock = b.plan.rocks.find((rock) => !rock.authored)!;
  expect(rock).toBeDefined();
  document.entities[rock.id] = { id: rock.id, components: { solid: { values: { elevation: 100 } } } };
  applySpatialSceneryEdits(b.plan, document, () => 0);
  const raised = b.plan.rocks.find((item) => item.id === rock.id)!;
  expect(raised.baseHeight).toBe(100);
  expect(Math.min(...raised.boxes!.map((box) => box.elevation!))).toBeCloseTo(100);
  expect(a.plan.rocks.find((item) => item.id === rock.id)?.baseHeight).not.toBe(100);
}, 30000);

it("local shape changes invalidate only that rock and its child inherits the authored ridge controls", () => {
  const document = createSeedPlanningInputs(1),
    id = "backdrop-0-0",
    child = rockObbId(id, id);
  const first = readRockFormationSettings(document);
  document.entities[child] = editableEntity(
    document,
    {
      id: child,
      name: child,
      parent: id,
      kind: "rockObb",
      components: {}
    },
    createSpatialWorldBase(exportPlanningRecipe(document))
  );
  expect(resolveComponent(document, child, "rockFormation", planningRegistry).values.topSlope).toBe(
    document.entities[id].components.rockFormation.values.topSlope
  );
  document.entities[id].components.rockFormation.values.topSlope = 35;
  const next = readRockFormationSettings(document);
  expect(rockGeometrySettings(first)).not.toEqual(rockGeometrySettings(next));
  expect(rockSettingsForJob(first, child)).not.toEqual(rockSettingsForJob(next, child));
  expect(rockSettingsForJob(first, "backdrop-0-1:obb:backdrop-0-1")).toEqual(
    rockSettingsForJob(next, "backdrop-0-1:obb:backdrop-0-1")
  );
  expect(rockSettingsForJob(first, "ground-stone")).toEqual(rockSettingsForJob(next, "ground-stone"));
});
