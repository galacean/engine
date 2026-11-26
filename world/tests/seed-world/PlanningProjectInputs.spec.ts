import { afterEach, expect, it, vi } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { createTemplatePlanningDocument } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { registerPlanningComponent } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import {
  PLANNING_PROJECT_PATH,
  planningSourceDocument,
  validatePlanningProject,
  writePlanningProjectSource
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource";

afterEach(() => vi.restoreAllMocks());
function fixture(): RuntimeProjectPackage {
  const pack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "Main.scene",
      files: [
        { virtualPath: "Main.scene", path: "Main.scene", type: "Scene" },
        { virtualPath: "host", path: "host", type: "Host" }
      ]
    },
    contents: {
      "Main.scene": JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: [] },
        entities: [],
        components: []
      }),
      host: "time:1"
    }
  };
  const draft = new RuntimeProjectEdit(
    pack,
    new Map([...nativeAssetFormats(() => ({})), ["Host", { validate() {}, references: () => [], referenceTypes: [] }]])
  );
  writePlanningProjectSource(draft, "Main.scene", createSeedPlanningDocument(1));
  return draft.finish();
}

it("enforces the entry template on native Scene and legacy planning publications", () => {
  const original = fixture();
  const other = createTemplatePlanningDocument(42, "sakura-pearl");
  const draft = new RuntimeProjectEdit(original, nativeAssetFormats(() => ({})));
  writePlanningProjectSource(draft, original.project.scene, other);
  const candidate = draft.finish();

  expect(() => validatePlanningProject(original, "original")).not.toThrow();
  expect(() => validatePlanningProject(candidate, "sakura-pearl")).not.toThrow();
  expect(() => validatePlanningProject(candidate, "original")).toThrow("工程模板 sakura-pearl 与当前入口 original 不一致");

  const legacy = {
    ...original,
    contents: { [PLANNING_PROJECT_PATH]: JSON.stringify(other) }
  };
  expect(() => validatePlanningProject(legacy, "sakura-pearl")).not.toThrow();
  expect(() => validatePlanningProject(legacy, "original")).toThrow("工程模板 sakura-pearl 与当前入口 original 不一致");
});

it("reuses parsed Source for host-only edits and isolates returned documents", () => {
  const pack = fixture(),
    read = vi.spyOn(RuntimeProjectEdit.prototype, "preview");
  const first = planningSourceDocument(pack)!;
  const count = read.mock.calls.length;
  expect(count).toBeGreaterThan(0);
  first.revision = 12345;
  pack.contents.host = "time:2";
  expect(planningSourceDocument(pack)!.revision).not.toBe(12345);
  expect(read.mock.calls.length).toBe(count);
  validatePlanningProject(pack);
  const source = JSON.parse(pack.contents[pack.project.scene] as string);
  source.components.find((c: any) => c.type === "PlanningGroundWind").props.windEnabled = "invalid";
  pack.contents[pack.project.scene] = JSON.stringify(source);
  expect(() => validatePlanningProject(pack)).toThrow();
});

it("invalidates on restored Source and import markers, including prior failures", () => {
  const pack = fixture(),
    original = pack.contents[pack.project.scene];
  expect(planningSourceDocument(pack)).toBeDefined();
  pack.contents[pack.project.scene] = JSON.stringify({
    asset: { version: "2.0" },
    scene: { rootEntities: [] },
    entities: [],
    components: []
  });
  expect(planningSourceDocument(pack)).toBeUndefined();
  pack.documents = { [`${pack.project.scene}.planning-source.json`]: '{"version":2}' };
  expect(() => validatePlanningProject(pack)).toThrow("requires a PlanningProjectAuthoring owner");
  pack.contents[pack.project.scene] = original;
  expect(() => validatePlanningProject(pack)).not.toThrow();
  expect(planningSourceDocument(pack)).toBeDefined();
});

it("does not write or dirty an unchanged Scene, including formatted Source", () => {
  const pack = fixture();
  pack.contents[pack.project.scene] = JSON.stringify(JSON.parse(pack.contents[pack.project.scene] as string), null, 2);
  const draft = new RuntimeProjectEdit(
    pack,
    nativeAssetFormats(() => ({}))
  );
  const update = vi.spyOn(draft, "update");
  writePlanningProjectSource(draft, pack.project.scene, planningSourceDocument(pack)!);
  expect(update).not.toHaveBeenCalled();
  expect(draft.changed.size).toBe(0);
  expect(draft.read(pack.project.scene)).toBe(pack.contents[pack.project.scene]);
});

it("writes one final Scene for multiple component changes, retaining unrelated properties and validation", () => {
  const pack = fixture();
  const source = JSON.parse(pack.contents[pack.project.scene] as string);
  const owner = source.components.find((c: any) => c.type === "PlanningProjectAuthoring");
  owner.props.unowned = { keep: true };
  pack.contents[pack.project.scene] = JSON.stringify(source);
  const document = planningSourceDocument(pack)!;
  document.revision++;
  document.authoredResources = [
    {
      resourceId: "test-brush",
      resourceType: "terrain-patch",
      properties: { x: 500, z: 500, radiusMetres: 20, heightDeltaMetres: 1 }
    }
  ];
  const draft = new RuntimeProjectEdit(
    pack,
    nativeAssetFormats(() => ({}))
  );
  const update = vi.spyOn(draft, "update");
  writePlanningProjectSource(draft, pack.project.scene, document);
  expect(update).toHaveBeenCalledTimes(1);
  const next = draft.preview();
  expect(planningSourceDocument(next)!.authoredResources).toEqual(document.authoredResources);
  expect(
    JSON.parse(next.contents[pack.project.scene] as string).components.find((c: any) => c.id === owner.id).props.unowned
  ).toEqual({ keep: true });
  expect(() => validatePlanningProject(next)).not.toThrow();
  update.mockClear();
  writePlanningProjectSource(draft, pack.project.scene, planningSourceDocument(next)!);
  expect(update).not.toHaveBeenCalled();
});

it("invalidates cached planning inputs on in-place project.scene switch, same-length files swap, and sidecar mutation", () => {
  const base = fixture();
  const secondDoc = createSeedPlanningDocument(99);
  secondDoc.revision = 777;
  base.project.scenes = ["Main.scene", "Second.scene"];
  base.project.files.push({ virtualPath: "Second.scene", path: "Second.scene", type: "Scene", dependencies: [] });
  base.contents["Second.scene"] = JSON.stringify({
    asset: { version: "2.0" },
    scene: { rootEntities: [] },
    entities: [],
    components: []
  });
  const secondDraft = new RuntimeProjectEdit(
    base,
    new Map([...nativeAssetFormats(() => ({})), ["Host", { validate() {}, references: () => [], referenceTypes: [] }]])
  );
  writePlanningProjectSource(secondDraft, "Second.scene", secondDoc);
  const pack = secondDraft.finish();
  const secondSource = JSON.parse(pack.contents["Second.scene"] as string);
  secondSource.components.find((c: any) => c.type === "PlanningGroundWind").props.windEnabled = "invalid";
  pack.contents["Second.scene"] = JSON.stringify(secondSource);

  validatePlanningProject(pack);
  pack.project.scene = "Second.scene";
  expect(() => validatePlanningProject(pack)).toThrow();
  expect(planningSourceDocument(pack)?.revision).toBe(777);

  pack.project.scene = "Main.scene";
  validatePlanningProject(pack);
  pack.project.files = pack.project.files.map((file) =>
    file.virtualPath === "Main.scene" ? { ...file, type: "JSON" } : file
  );
  expect(() => planningSourceDocument(pack)).toThrow("Unregistered runtime Scene 'Main.scene'");

  const sidecarPack = fixture();
  sidecarPack.documents = { "notes.md": "ok" };
  sidecarPack.contents["Main.scene"] = JSON.stringify({
    asset: { version: "2.0" },
    scene: { rootEntities: [] },
    entities: [],
    components: []
  });
  validatePlanningProject(sidecarPack);
  sidecarPack.documents[`${sidecarPack.project.scene}.planning-source.json`] = '{"version":2}';
  expect(() => validatePlanningProject(sidecarPack)).toThrow("requires a PlanningProjectAuthoring owner");
});

it("re-validates cached planning documents when registered components change", () => {
  const unregister = registerPlanningComponent({
    type: "testDynamicPlanningComp",
    label: "Dynamic",
    version: 1,
    fields: [{ key: "count", label: "Count", type: "number", default: 1 }]
  });
  try {
    const pack = fixture();
    const doc = planningSourceDocument(pack)!;
    doc.entities["dynamic-entity"] = {
      id: "dynamic-entity",
      name: "Dynamic",
      origin: "authored",
      components: { testDynamicPlanningComp: { values: { count: 3 } } }
    };
    const draft = new RuntimeProjectEdit(
      pack,
      new Map([...nativeAssetFormats(() => ({})), ["Host", { validate() {}, references: () => [], referenceTypes: [] }]])
    );
    writePlanningProjectSource(draft, "Main.scene", doc);
    const updated = draft.finish();

    validatePlanningProject(updated);
    unregister();
    expect(() => validatePlanningProject(updated)).toThrow("未注册组件");
  } finally {
    unregister();
  }
});
