import { expect, it } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  planningSourceDocument,
  writePlanningProjectSource
} from "../src/planning/spatial/runtime/PlanningProjectSource";
import { initializePlanningWater } from "../src/planning/spatial/runtime/PlanningWaterInitialization";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { createSeedWorldProjectClose } from "../SeedWorldProjectClose";
import { parsePlanningResources } from "@galacean/engine-world-planning/spatial/PlanningResources";

it("persists generated water once as Source and projects edits without a second shape record", () => {
  expect(() =>
    parsePlanningResources([{ resourceType: "river", resourceId: "duplicate-author", properties: {} }])
  ).toThrow();
  const scenePath = "Main.scene",
    formats = new Map([...nativeAssetFormats(() => ({}))]);
  const contents = {
    [scenePath]: JSON.stringify({
      asset: { version: "2.0" },
      scene: { rootEntities: [] },
      entities: [],
      components: []
    }),
    "Water/Materials/lake.mat": JSON.stringify({
      name: "unloaded-author-fixture",
      shader: "WaterTest",
      shaderData: {},
      macros: []
    })
  };
  const pack = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: scenePath,
      files: Object.keys(contents).map((virtualPath) => ({
        virtualPath,
        path: virtualPath,
        type: virtualPath === scenePath ? "Scene" : virtualPath.endsWith(".mat") ? "Material" : "JSON"
      }))
    },
    contents
  };
  const draft = new RuntimeProjectEdit(pack, formats),
    document = createSeedPlanningDocument(1);
  const plan = {
    waters: [
      {
        id: "lake:0",
        label: "Lake",
        kind: "lake",
        outline: [
          { x: 1, z: 1 },
          { x: 7, z: 1 },
          { x: 4, z: 7 }
        ],
        lake: { center: { x: 4, z: 4 }, radiusM: 3, referenceLevel: 2, waterLevel: 2, depthM: 1, carved: true }
      }
    ]
  } as unknown as IslandPlan;
  const disabled = initializePlanningWater(draft, document, { waters: [] } as unknown as IslandPlan);
  expect(disabled.entities["lake:0"]).toBeUndefined();
  writePlanningProjectSource(draft, scenePath, initializePlanningWater(draft, document, plan));
  const scene = new RuntimeSceneEdit(draft, scenePath),
    body = scene.queryComponents({ type: "WaterBodyComponent" })[0];
  const input = scene.readComponent(body.id).props!.authoring as GalaceanSourceValueRecord;
  scene.updateComponent(body.id, {
    enabled: false,
    authoring: { ...input, visible: false, shape: { ...(input.shape as GalaceanSourceValueRecord), levelOffsetM: 0 } }
  });
  const first = draft.finish(),
    read = planningSourceDocument(first)!;
  expect(read.entities["lake:0"].components.lakes.values).toMatchObject({
    referenceLevel: 2,
    levelOffsetM: 0,
    enabled: false
  });
  const acceptedScene = new RuntimeSceneEdit(new RuntimeProjectEdit(first, formats), scenePath);
  const identity = acceptedScene.queryComponents({ type: "PlanningEntityAuthoring", entityId: body.entityId })[0];
  expect(acceptedScene.readComponent(identity.id).props!.spatialComponents).not.toHaveProperty("lakes");
  const linked = new RuntimeProjectEdit(first, formats),
    linkedScene = new RuntimeSceneEdit(linked, scenePath);
  linked.create(
    { virtualPath: "Water/host-lake.prefab", path: "Water/host-lake.prefab", type: "Prefab" },
    JSON.stringify({
      asset: { version: "2.0" },
      root: "lake-root",
      entities: [{ id: "lake-root", name: "Lake", components: ["identity", "body"] }],
      components: [
        {
          id: "identity",
          type: "PlanningEntityAuthoring",
          props: { planningId: "lake:0", spatialComponents: {}, parentId: "world" }
        },
        { id: "body", type: "WaterBodyComponent", props: { authoring: input } }
      ]
    })
  );
  const parent = linkedScene.queryComponents({ type: "PlanningProjectAuthoring" })[0].entityId;
  const root = linkedScene.create({
    name: "Prefab A",
    prefab: "Water/host-lake.prefab",
    parentEntityId: parent,
    position: [10, 0, 0]
  });
  linkedScene.create({
    name: "Prefab B",
    prefab: "Water/host-lake.prefab",
    parentEntityId: parent,
    position: [20, 0, 0]
  });
  linkedScene.update(root.id, { isActive: false });
  const inactive = planningSourceDocument(linked.preview())!;
  expect(
    Object.values(inactive.entities)
      .filter((entity) => entity.components.lakes?.values.referenceLevel === 2)
      .filter((entity) => entity.components.lakes.values.enabled === false)
  ).toHaveLength(2);
  linkedScene.update(root.id, { isActive: true });
  const override = linkedScene.queryComponents({ type: "WaterBodyComponent", entityId: root.id })[0];
  linkedScene.updateComponent(override.id, {
    authoring: { ...input, shape: { ...(input.shape as GalaceanSourceValueRecord), levelOffsetM: 0.5 } }
  });
  const linkedRead = planningSourceDocument(linked.preview())!;
  expect(
    Object.values(linkedRead.entities).some((entity) => entity.components.lakes?.values.levelOffsetM === 0.5)
  ).toBe(true);
  const lakeIds = Object.keys(linkedRead.entities).filter((id) => id.startsWith("lake:"));
  expect(lakeIds).toHaveLength(3);
  expect(new Set(lakeIds).size).toBe(3);
  writePlanningProjectSource(linked, scenePath, linkedRead);
  const linkedSource = JSON.parse(linked.read(scenePath) as string);
  expect(linkedSource.entities.filter((entity: { instance?: unknown }) => entity.instance)).toHaveLength(2);
  expect(
    linkedSource.components.filter((component: { type: string }) => component.type === "WaterBodyComponent")
  ).toHaveLength(1);
  const replay = new RuntimeProjectEdit(first, formats);
  writePlanningProjectSource(replay, scenePath, initializePlanningWater(replay, read, plan));
  expect(new RuntimeSceneEdit(replay, scenePath).queryComponents({ type: "WaterBodyComponent" })).toHaveLength(1);
  expect(new RuntimeSceneEdit(replay, scenePath).readComponent(body.id).props!.enabled).toBe(false);
  const posedScene = new RuntimeSceneEdit(replay, scenePath);
  const localShape = structuredClone(
    (posedScene.readComponent(body.id).props!.authoring as GalaceanSourceValueRecord).shape
  );
  posedScene.update(body.entityId, { position: [10, 2, 0], rotation: [0, 90, 0] });
  const projected = planningSourceDocument(replay.preview())!;
  expect(projected.entities["lake:0"].components.lakes.values.referenceLevel).toBe(4);
  writePlanningProjectSource(replay, scenePath, projected);
  expect((posedScene.readComponent(body.id).props!.authoring as GalaceanSourceValueRecord).shape).toEqual(localShape);
  new RuntimeSceneEdit(replay, scenePath).removeComponent(body.id);
  const removed = replay.finish(),
    removedDocument = planningSourceDocument(removed)!;
  expect(removedDocument.entities["lake:0"].components.lakes.values.enabled).toBe(false);
  const reopen = new RuntimeProjectEdit(removed, formats);
  writePlanningProjectSource(reopen, scenePath, initializePlanningWater(reopen, removedDocument, plan));
  expect(new RuntimeSceneEdit(reopen, scenePath).queryComponents({ type: "WaterBodyComponent" })).toHaveLength(0);
});

it("drains author work before saving and retains the runtime when saving needs a retry", async () => {
  const events: string[] = [];
  let complete!: () => void,
    attempts = 0,
    releases = 0;
  const author = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const close = createSeedWorldProjectClose(
    async () => {
      events.push("stop");
      await author;
      events.push("drained");
    },
    async () => {
      events.push("save");
      if (++attempts === 1) throw new Error("Storage unavailable");
    },
    async () => {
      events.push("destroy");
      if (++releases === 1) throw new Error("Release failed");
    }
  );
  const first = close();
  expect(events).toEqual(["stop"]);
  complete();
  await expect(first).rejects.toThrow("Storage unavailable");
  expect(events).toEqual(["stop", "drained", "save"]);
  await expect(close()).rejects.toThrow("Release failed");
  expect(events).toEqual(["stop", "drained", "save", "save", "destroy"]);
  await close();
  expect(events).toEqual(["stop", "drained", "save", "save", "destroy", "destroy"]);
  expect(attempts).toBe(2);
});
