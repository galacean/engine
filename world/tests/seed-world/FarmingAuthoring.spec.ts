import { expect, it, vi } from "vitest";
import type { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeAssetChanges } from "@galacean/engine-runtime-editor/project/runtime-asset-changes";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectStorage,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";
import { farmingResourceData } from "@galacean/engine-farming/farming/native/FarmingResources";
import * as FarmingResourceDefinitions from "@galacean/engine-farming/farming/native/FarmingResources";
import { FARMING_PROP_ANIMATIONS } from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { DEFAULT_STORAGE_DEFINITIONS } from "@galacean/engine-farming/farming/storage/StorageDefaults";
import {
  createPlanningFarmingAuthoringValidator,
  setPlanningFarmingGrowth,
  validatePlanningFarmingAuthoring
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAuthoring.ts";
import {
  planningFarmingAssetRoots,
  planningFarmingAssetsAffected
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAssets.ts";
import { seedWorldProjectFormats } from "../../demos/seed-world/SeedWorldProjectFormats.ts";

const FARM_SCENE = "Farm.scene",
  FARM_CATALOG = "Farm/Catalog.json",
  FARM_RULES = "Farm/Rules.json",
  FARM_STATE = "Farm/State.json";
const HOE = FARMING_PROP_ANIMATIONS.hoe.prefabUrl,
  MATERIAL = "Custom/X.mat",
  TEXTURE = "Custom/X.ktx2",
  UNRELATED = "Other/Y.json";
const resourceData = farmingResourceData(FARM_DEFINITIONS);
const jsonFile = (virtualPath: string) => ({ virtualPath, path: virtualPath, type: "JSON", dependencies: [] as string[] });

function farmingTestProject(): RuntimeProjectPackage {
  const component = {
    id: "system",
    type: "FarmingSystem",
    props: { catalog: { $ref: FARM_CATALOG }, rules: { $ref: FARM_RULES }, state: { $ref: FARM_STATE } }
  };
  return {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: FARM_SCENE,
      files: [
        { virtualPath: FARM_SCENE, path: FARM_SCENE, type: "Scene", dependencies: [FARM_CATALOG, FARM_RULES, FARM_STATE] },
        ...[FARM_CATALOG, FARM_RULES, FARM_STATE].map(jsonFile)
      ]
    },
    contents: {
      [FARM_SCENE]: JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: ["system-entity"], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
        entities: [{ id: "system-entity", name: "Farm", components: [component.id] }],
        components: [component]
      }),
      [FARM_CATALOG]: JSON.stringify({ version: 1, kind: "catalog", data: resourceData.catalog }),
      [FARM_RULES]: JSON.stringify({ version: 1, kind: "rules", data: resourceData.rules }),
      [FARM_STATE]: JSON.stringify({ version: 1, farms: {} })
    }
  };
}

function projectWithProp() {
  const pack = farmingTestProject();
  pack.project.files.push(
    { virtualPath: HOE, path: HOE, type: "Prefab", dependencies: [MATERIAL] },
    { virtualPath: MATERIAL, path: MATERIAL, type: "Material", dependencies: [TEXTURE] },
    { virtualPath: TEXTURE, path: TEXTURE, type: "KTX2", dependencies: [] },
    jsonFile(UNRELATED)
  );
  pack.contents[HOE] = JSON.stringify({ material: { $ref: MATERIAL } });
  pack.contents[MATERIAL] = JSON.stringify({ texture: { $ref: TEXTURE } });
  pack.contents[TEXTURE] = new Uint8Array([1]);
  pack.contents[UNRELATED] = JSON.stringify({ value: 1 });
  return pack;
}

it("validates referenced farming JSON without misclassifying unrelated JSON", () => {
  expect(() =>
    seedWorldProjectFormats.get("JSON")!.validate(JSON.stringify({ kind: "rules", domain: "unrelated" }))
  ).not.toThrow();
  const pack = farmingTestProject();
  expect(() => validatePlanningFarmingAuthoring(pack)).not.toThrow();
  pack.contents[FARM_CATALOG] = JSON.stringify({ version: 1, data: resourceData.catalog });
  expect(() => validatePlanningFarmingAuthoring(pack)).toThrow();
  pack.contents[FARM_CATALOG] = pack.contents[FARM_RULES];
  expect(() => validatePlanningFarmingAuthoring(pack)).toThrow("catalog references a rules");
});

it("reuses unchanged resources and keeps cache intact across loader, swap, rejected candidate and version errors", () => {
  const validate = createPlanningFarmingAuthoringValidator();
  const pack = farmingTestProject();
  const catalog = pack.contents[FARM_CATALOG];
  const parse = vi.spyOn(JSON, "parse");
  const pair = vi.spyOn(FarmingResourceDefinitions, "farmingDefinitionsFromData");
  try {
    validate(pack);
    const checkpoint = structuredClone(pack);
    checkpoint.contents[FARM_STATE] = JSON.stringify({ version: 1, farms: {}, initializations: {} });
    validate(checkpoint);
    expect(parse.mock.calls.filter(([text]) => text === catalog)).toHaveLength(1);
    expect(pair).toHaveBeenCalledOnce();

    checkpoint.contents[FARM_CATALOG] = checkpoint.contents[FARM_RULES];
    expect(() => validate(checkpoint)).toThrow("catalog references a rules");
    checkpoint.contents[FARM_CATALOG] = catalog;
    checkpoint.project.files.find((file) => file.virtualPath === FARM_CATALOG)!.type = "Material";
    expect(() => validate(checkpoint)).toThrow("catalog requires a JSON asset");

    const swapped = structuredClone(pack);
    const scene = JSON.parse(swapped.contents[FARM_SCENE] as string);
    scene.components[0].props.catalog = { $ref: FARM_RULES };
    swapped.contents[FARM_SCENE] = JSON.stringify(scene);
    expect(() => validate(swapped)).toThrow("catalog references a rules");

    const rejected = structuredClone(pack);
    rejected.contents[FARM_CATALOG] = JSON.stringify({
      version: 1,
      kind: "catalog",
      data: { ...resourceData.catalog, seeds: resourceData.catalog.seeds.map((seed) => ({ ...seed, name: "Candidate" })) }
    });
    rejected.contents[FARM_RULES] = rejected.contents[FARM_CATALOG];
    expect(() => validate(rejected)).toThrow("rules references a catalog");
    validate(pack);
    expect(parse.mock.calls.filter(([text]) => text === catalog)).toHaveLength(1);

    const mismatched = structuredClone(pack);
    mismatched.contents[FARM_RULES] = JSON.stringify({
      version: 1,
      kind: "rules",
      data: { ...resourceData.rules, version: resourceData.rules.version + 1 }
    });
    expect(() => validate(mismatched)).toThrow(/catalog and rules data versions must match/);
    mismatched.contents[FARM_RULES] = JSON.stringify({
      version: 1,
      kind: "rules",
      data: { ...resourceData.rules, simulationConfig: { cropGrowthMultiplier: 2 } }
    });
    validate(mismatched);
    expect(parse.mock.calls.filter(([text]) => text === catalog)).toHaveLength(1);
  } finally {
    pair.mockRestore();
    parse.mockRestore();
  }
});

it("rejects a bad effective Prefab pair during publish and undo, and saves only the accepted pair", async () => {
  const pack = farmingTestProject();
  const source = JSON.parse(pack.contents[FARM_SCENE] as string) as GalaceanSourceSceneFile;
  const prefab = "Farm/Test.prefab",
    override = "Farm/Override.rules.json";
  const crop = resourceData.catalog.crops[0].id;
  const bad = { ...DEFAULT_STORAGE_DEFINITIONS.crops };
  delete bad[crop];
  const rulesText = (data: object) =>
    JSON.stringify({ version: 1, kind: "rules", data: { ...resourceData.rules, ...data } });
  const invalidText = rulesText({ storage: { ...DEFAULT_STORAGE_DEFINITIONS, crops: bad } });
  const validText = rulesText({ storage: undefined, simulationConfig: { cropGrowthMultiplier: 2 } });
  const root = source.scene.rootEntities[0];
  pack.project.files[0].dependencies = [prefab, override];
  pack.project.files.push(
    { virtualPath: prefab, path: prefab, type: "Prefab", dependencies: [FARM_CATALOG, FARM_RULES, FARM_STATE] },
    jsonFile(override)
  );
  pack.contents[prefab] = JSON.stringify({ asset: source.asset, root, entities: source.entities, components: source.components });
  pack.contents[FARM_SCENE] = JSON.stringify({
    ...source,
    entities: [
      {
        id: root,
        instance: {
          asset: { $ref: prefab },
          overrides: { componentProps: [{ target: source.components[0].id, props: { rules: { $ref: override } } }] }
        }
      }
    ],
    components: []
  } satisfies GalaceanSourceSceneFile);
  pack.contents[override] = invalidText;
  let saved: RuntimeProjectPackage | undefined;
  const storage = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => structuredClone(pack),
    save: async (_id: string, accepted: RuntimeProjectPackage) => {
      saved = structuredClone(accepted);
    },
    close: () => {}
  } as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("farm-pair", pack.project, "https://farm.test/");
  try {
    session.registerProjectValidator(createPlanningFarmingAuthoringValidator());
    const formats = new Map([...nativeAssetFormats(() => ({})), ...seedWorldProjectFormats]);
    const publish = (text: string) => {
      const draft = new RuntimeProjectEdit(session.projectPackage, formats);
      draft.update(override, text);
      return session.publish(draft.finish());
    };
    await publish(validText);
    const revision = session.publicationRevision;
    const history = session.history.query();
    await expect(publish(invalidText)).rejects.toThrow(`Missing crop storage definition: ${crop}`);
    const move = { direction: "undo" as const, transactionIds: [history.undo[0].transactionId] };
    const undo = new RuntimeProjectEdit(session.projectPackage, formats);
    undo.restore(await session.historyPatch(move, new AbortController().signal));
    await expect(
      session.publish(undo.finish(), revision, [], { transactionId: crypto.randomUUID(), move })
    ).rejects.toThrow(`Missing crop storage definition: ${crop}`);
    expect(session.publicationRevision).toBe(revision);
    expect(session.history.query()).toEqual(history);
    await session.save();
    expect(saved?.contents[override]).toBe(validText);
    const later = rulesText({ simulationConfig: { cropGrowthMultiplier: 3 } });
    await publish(later);
    await session.save();
    expect(saved?.contents[override]).toBe(later);
  } finally {
    session.dispose();
    storage.mockRestore();
  }
});

it("reports committed authoring separately from activation failure and propagates precommit failures", async () => {
  const activatedFail = {
    run: vi.fn(async () => {}),
    prepare: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    activate: vi.fn(async () => {
      throw Error("Consumer unavailable");
    }),
    complete: vi.fn(async () => {})
  };
  expect(
    await setPlanningFarmingGrowth({ beginEdit: () => activatedFail } as unknown as Pick<RuntimeEditor, "beginEdit">, "Farm.scene", 0)
  ).toEqual({ committed: true, activationError: "Error: Consumer unavailable" });
  expect(activatedFail.commit).toHaveBeenCalledOnce();
  expect(activatedFail.complete).toHaveBeenCalledOnce();

  const precommitFail = {
    run: vi.fn(async () => {}),
    prepare: vi.fn(async () => {
      throw Error("Invalid authoring");
    }),
    commit: vi.fn(),
    complete: vi.fn(async () => {})
  };
  await expect(
    setPlanningFarmingGrowth({ beginEdit: () => precommitFail } as unknown as Pick<RuntimeEditor, "beginEdit">, "Farm.scene", 0)
  ).rejects.toThrow("Invalid authoring");
  expect(precommitFail.commit).not.toHaveBeenCalled();
  expect(precommitFail.complete).toHaveBeenCalledOnce();
});

it("tracks farming asset dependencies accurately across prop overrides, cache fills, and unrelated edits", () => {
  const roots = [FARM_CATALOG, FARM_RULES, HOE];
  expect(
    planningFarmingAssetRoots({
      id: "farm",
      type: "FarmingSystem",
      props: { catalog: { $ref: FARM_CATALOG }, rules: { $ref: FARM_RULES } }
    })
  ).toEqual(expect.arrayContaining(roots));

  const pack = projectWithProp();
  const changes = new RuntimeAssetChanges(pack);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);
  pack.contents[MATERIAL] = JSON.stringify({ texture: { $ref: TEXTURE }, roughness: 1 });
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(true);
  changes.accept(pack);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);
  pack.contents[TEXTURE] = new Uint8Array([2]);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(true);
  pack.contents[UNRELATED] = JSON.stringify({ value: 2 });
  changes.accept(pack);
  pack.contents[TEXTURE] = new Uint8Array([2]);
  expect(planningFarmingAssetsAffected(changes, pack, roots)).toBe(false);

  const lazy = projectWithProp();
  delete lazy.contents[HOE];
  delete lazy.contents[MATERIAL];
  const lazyChanges = new RuntimeAssetChanges(lazy);
  for (const path of [HOE, MATERIAL]) {
    const content = JSON.stringify({ read: path });
    lazy.contents[path] = content;
    lazyChanges.recordRead(lazy.project.files.find((file) => file.virtualPath === path)!, content);
  }
  expect(planningFarmingAssetsAffected(lazyChanges, lazy, roots)).toBe(false);
});
