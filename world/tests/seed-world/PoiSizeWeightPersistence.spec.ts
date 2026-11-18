import { describe, expect, it } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningAuthoring, exportPlanningRecipe, upgradePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { switchPlanningLayoutScope } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { applySpatialCommands } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { exportPlanningScene, importPlanningScene } from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import { PlanningProjectStorage } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { planningSourceDocument } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource.ts";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { createSeedWorldParameterTools } from "../../demos/seed-world/agent-adapter/tools/parameter-tools.ts";
import type { AgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { createSeedWorldKnowledge } from "../../demos/seed-world/agent-adapter/SeedWorldKnowledge.ts";

const poiId = "poi-authored-fixture";
const seed = 110513;

function authoring() {
  const document = createSeedPlanningDocument(seed);
  document.entities[poiId] = { id: poiId, name: "Selected POI", parent: "world", components: { poi: { values: {} } } };
  return applySpatialCommands(document, [{ op: "set", entity: poiId, component: "poi", values: { sizeWeight: 1.75 } }], planningRegistry);
}

describe("single POI size weight authoring persistence", () => {
  it("exposes the selected POI through the real Agent parameter contracts and commits a sparse override", async () => {
    const document = createSeedPlanningDocument(seed);
    const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
    await session.initialize();
    const tools = createSeedWorldParameterTools({ parameterAuthoring: {
      describe: () => session.describe(),
      query: filter => session.query(filter),
      inspect: id => ({ ...session.inspect(id), versionToken: String(session.document.revision) }),
      apply: async (commands, token) => {
        const receipt = await session.dispatchParameters(commands, Number(token));
        return { ...receipt, versionToken: String(receipt.revision) };
      }
    } });
    const componentTypes = session.describe().map(component => component.type);
    const knowledge = createSeedWorldKnowledge(tools.map(tool => tool.name), componentTypes);
    const spatialGuide = knowledge.documents.find(document => document.path === "skills/spatial/references/components.md");
    expect(spatialGuide).toBeDefined();
    expect(spatialGuide!.content).toContain("poi.sizeWeight");
    expect(spatialGuide!.content).toContain("actualAreaM2");
    expect(spatialGuide!.content).toContain("op:'reset'");
    expect(spatialGuide!.content).toContain("fields:['sizeWeight']");
    expect(spatialGuide!.content).toContain("versionToken");
    expect(knowledge.modules.some(module => module.id === "declare/world/tools/world.parameters.apply.d.ts")).toBe(true);
    const unavailable = createSeedWorldKnowledge(tools.map(tool => tool.name), componentTypes.filter(type => type !== "poi"));
    expect(unavailable.documents.find(document => document.path === "skills/spatial/references/components.md")?.content ?? "")
      .not.toContain("poi.sizeWeight");
    const call = async (name: string, input: AgentValue) => {
      const tool = tools.find(tool => tool.name === `world.parameters.${name}`)!;
      return tool.parseOutput(await tool.execute(tool.parseInput(input), { signal: new AbortController().signal })) as any;
    };
    const described = await call("describe", { component: "poi", fields: ["sizeWeight", "actualAreaM2", "active"] });
    expect(described.componentTypes).toContain("poi");
    expect(described.components[0].fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "sizeWeight", default: 1, min: 0.001 }),
      expect.objectContaining({ key: "actualAreaM2", readonly: true })
    ]));
    const queried = await call("query", { component: "poi", kind: "poi", limit: 1 });
    const id = queried.entities[0].id;
    const inspected = await call("inspect", { id, component: "poi", fields: ["sizeWeight", "actualAreaM2", "active"] });
    expect(inspected.components[0].values.sizeWeight).toBe(1);
    expect(inspected.components[0].values.active).toBe(true);
    expect(inspected.components[0].values.actualAreaM2).toBeGreaterThan(0);
    expect(inspected.components[0].local.sizeWeight).toBeUndefined();
    const receipt = await call("apply", { versionToken: inspected.versionToken,
      commands: [{ op: "set", entity: id, component: "poi", values: { sizeWeight: 1.01 } }] });
    expect(receipt.status).toBe("accepted");
    expect(session.document.entities[id].components.poi.values).toEqual({ sizeWeight: 1.01 });
    expect(exportPlanningRecipe(session.document).edits[id].poi).toEqual({ sizeWeight: 1.01 });
    const stale = await call("apply", { versionToken: inspected.versionToken,
      commands: [{ op: "set", entity: id, component: "poi", values: { sizeWeight: 2 } }] });
    expect(stale.status).toBe("rejected");
    expect(session.document.entities[id].components.poi.values).toEqual({ sizeWeight: 1.01 });
  }, 30_000);

  it("retains a sparse override through author JSON and native Scene roundtrips", () => {
    const document = authoring();
    const restored = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(document))));
    const native = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(restored))));
    for (const value of [restored, native]) {
      expect(value.entities[poiId].components.poi.values).toEqual({ sizeWeight: 1.75 });
      expect(exportPlanningRecipe(value).edits[poiId].poi).toEqual({ sizeWeight: 1.75 });
      expect(value.entities.world.components.poi).toBeUndefined();
    }
    const reset = applySpatialCommands(native, [{ op: "reset", entity: poiId, component: "poi", fields: ["sizeWeight"] }], planningRegistry);
    expect(reset.entities[poiId].components.poi.values).toEqual({});
    expect(exportPlanningRecipe(reset).edits[poiId]?.poi?.sizeWeight).toBeUndefined();
  });

  it("restores the per-seed override after archiving through a native Scene", () => {
    const document = authoring();
    document.entities.world.components.world.values.seed = seed + 1;
    switchPlanningLayoutScope(document, seed);
    expect(document.entities[poiId]).toBeUndefined();
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(document))));
    restored.entities.world.components.world.values.seed = seed;
    switchPlanningLayoutScope(restored, seed + 1);
    expect(restored.entities[poiId].components.poi.values).toEqual({ sizeWeight: 1.75 });
    expect(exportPlanningRecipe(restored).edits[poiId].poi).toEqual({ sizeWeight: 1.75 });
  });

  it("saves the native Source and reloads the same sparse override without a legacy Planning.json asset", async () => {
    const path = "World.scene";
    const files = [{ virtualPath: path, path: "runtime-world:scene", type: "Scene" }];
    let pack: RuntimeProjectPackage = {
      version: RUNTIME_PROJECT_SAVE_VERSION,
      project: { scene: path, files },
      contents: { [path]: JSON.stringify(importRuntimeHierarchy(exportPlanningScene(createSeedPlanningDocument(seed)), path, files, () => true)) }
    };
    const project = {
      get projectPackage() { return pack; },
      async publish(next: RuntimeProjectPackage) { pack = structuredClone(next); }
    };
    await new PlanningProjectStorage(project).save(authoring());
    const serialized = JSON.stringify(pack);
    pack = JSON.parse(serialized);
    const restored = await new PlanningProjectStorage(project).load(seed);
    expect(restored!.entities[poiId].components.poi.values).toEqual({ sizeWeight: 1.75 });
    expect(planningSourceDocument(pack)!.entities[poiId].components.poi.values).toEqual({ sizeWeight: 1.75 });
    expect(pack.contents["World/Planning.json"]).toBeUndefined();
    expect(pack.project.files.some(file => file.virtualPath === "World/Planning.json")).toBe(false);
  });
});
