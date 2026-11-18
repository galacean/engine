import { expect, it, vi } from "vitest";
import { PlanningSession, type PlanningSessionOptions } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { spatialRevealInputSignature } from "@galacean/engine-world-planning/spatial/layout/SpatialEditInputs";

it("accepts renames through project activation without solving or replacing the physical plan", async () => {
  const initial = createSeedPlanningDocument(1);
  const execute = vi.fn(async (document, previous) => generatePlanningDocument(document, previous));
  const preparePublication = vi.fn<NonNullable<PlanningSessionOptions["preparePublication"]>>(async () => ({
    commit() {},
    discard() {}
  }));
  const session = new PlanningSession(exportPlanningRecipe(initial), execute, initial, { preparePublication });
  await session.initialize();
  const plan = session.result!.plan;
  execute.mockClear();
  preparePublication.mockClear();
  const edit = session.beginProjectEdit();
  const renamed = edit.session.export();
  renamed.entities.world.name = "Renamed world";
  renamed.entities.world.origin = "authored";
  renamed.entities = Object.fromEntries(Object.entries(renamed.entities).reverse());
  expect((await edit.session.load(renamed)).status).toBe("accepted");
  expect(execute).not.toHaveBeenCalled();
  expect(edit.session.result!.plan).toBe(plan);
  expect(spatialRevealInputSignature(renamed)).toBe(spatialRevealInputSignature(initial));
  const signal = new AbortController().signal;
  await edit.prepare(signal);
  edit.commit();
  await edit.activate(signal);
  expect(session.document.entities.world.name).toBe("Renamed world");
  expect(session.scene!.entities.get("world")!.name).toBe("Renamed world");
  expect(preparePublication).toHaveBeenCalledOnce();
  expect(preparePublication.mock.calls[0][2]).toMatchObject({ worldUnchanged: true, projectTransaction: true });
  expect(session.result!.plan).toBe(plan);
  expect((await session.undo())?.status).toBe("accepted");
  expect(session.document.entities.world.name).toBe(initial.entities.world.name);
  expect((await session.redo())?.status).toBe("accepted");
  expect(session.document.entities.world.name).toBe("Renamed world");
  const revealed = session.export();
  revealed.entities.world.components.landscape.values.density = 0.21;
  expect((await session.load(revealed)).status).toBe("accepted");
  expect(session.result!.contentUpdate).toBe("reveal");
  expect(execute).not.toHaveBeenCalled();
}, 60000);

it("still solves a rename mixed with a physical edit and restores geometry through history", async () => {
  const initial = createSeedPlanningDocument(1);
  const execute = vi.fn(async (document, previous) => generatePlanningDocument(document, previous));
  const session = new PlanningSession(exportPlanningRecipe(initial), execute, initial);
  await session.initialize();
  const plan = session.result!.plan;
  execute.mockClear();
  const changed = session.export();
  changed.entities.world.name = "Continuous world";
  changed.entities.world.components.world.values.landMode = "continuous";
  expect((await session.load(changed)).status).toBe("accepted");
  expect(execute).toHaveBeenCalledOnce();
  expect(session.result!.plan.parameters.landMode).toBe("continuous");
  expect((await session.undo())?.status).toBe("accepted");
  expect(session.result!.plan.parameters.landMode).toBe(plan.parameters.landMode);
  expect((await session.redo())?.status).toBe("accepted");
  expect(session.document.entities.world.name).toBe("Continuous world");
  expect(session.result!.plan.parameters.landMode).toBe("continuous");
}, 60000);
