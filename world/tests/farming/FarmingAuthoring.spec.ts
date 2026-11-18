import { expect, it, vi } from "vitest";
import { JSONAsset, type Engine } from "@galacean/engine-core";
import {
  farmingCatalog,
  farmingRules,
  encodeFarmingResourceFile,
  resolveFarmingJSONReferences,
  parseFarmingResourceFile,
  validateFarmingResourceFile
} from "@galacean/engine-farming/farming/native/FarmingResources";
import {
  MAX_GROWTH_MULTIPLIER,
  validateFarmingGrowthMultiplier,
  resolveSimulationConfig,
  validateSimulationParameters
} from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import {
  validatePlanningFarmingAuthoring,
  createPlanningFarmingAuthoringValidator,
  setPlanningFarmingGrowth
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingAuthoring.ts";
import { seedWorldProjectFormats } from "../../demos/seed-world/SeedWorldProjectFormats.ts";
import type { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import {
  RuntimeProjectStorage,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { DEFAULT_STORAGE_DEFINITIONS } from "@galacean/engine-farming/farming/storage/StorageDefaults";
import * as FarmingResourceDefinitions from "@galacean/engine-farming/farming/native/FarmingResources";
import {
  farmingTestProject,
  resourceData,
  FARM_CATALOG,
  FARM_RULES,
  FARM_SCENE,
  FARM_STATE
} from "./FarmingTestProject.ts";

it.each([null, 0, MAX_GROWTH_MULTIPLIER])("accepts growth boundary %s", (value) =>
  expect(() => validateFarmingGrowthMultiplier(value)).not.toThrow()
);
it.each([-1, MAX_GROWTH_MULTIPLIER + 1, NaN, Infinity, "0", undefined])("rejects invalid growth value %s", (value) =>
  expect(() => validateFarmingGrowthMultiplier(value)).toThrow()
);
it("rejects null in a resolved simulation, where inheritance must already be resolved", () => {
  const config = resolveSimulationConfig(resourceData.rules.soilProfile);
  expect(() =>
    validateSimulationParameters({ ...config, cropGrowthMultiplier: null } as unknown as typeof config)
  ).toThrow();
});
it("round trips native atlas refs to exactly the same domain data", () => {
  const file = {
    version: 1 as const,
    kind: "catalog" as const,
    data: {
      ...resourceData.catalog,
      plants: resourceData.catalog.plants.map((plant) => ({ ...plant, atlasUrl: `Textures/${plant.id}.ktx2` }))
    }
  };
  const before = structuredClone(file);
  expect(resolveFarmingJSONReferences(encodeFarmingResourceFile(file))).toEqual(file);
  expect(file).toEqual(before);
});
it("requires the resource kind expected by each JSONAsset view", () => {
  const engine = {} as Engine;
  const catalog = new JSONAsset(engine),
    rules = new JSONAsset(engine);
  catalog.data = { version: 1, kind: "catalog", data: resourceData.catalog };
  rules.data = { version: 1, kind: "rules", data: resourceData.rules };
  expect(farmingCatalog(catalog).data).toEqual(JSON.parse(JSON.stringify(resourceData.catalog)));
  expect(farmingRules(rules).data).toEqual(JSON.parse(JSON.stringify(resourceData.rules)));
  expect(() => farmingRules(catalog)).toThrow("Expected farming rules");
  expect(() => farmingCatalog(rules)).toThrow("Expected farming catalog");
});
it("does not interpret unrelated JSON kind fields as farming data", () => {
  expect(() =>
    seedWorldProjectFormats.get("JSON")!.validate(JSON.stringify({ kind: "rules", domain: "unrelated" }))
  ).not.toThrow();
});
it("validates only referenced JSON resources and rejects missing or swapped kinds before acceptance", () => {
  const pack = farmingTestProject();
  expect(() => validatePlanningFarmingAuthoring(pack)).not.toThrow();
  pack.contents[FARM_CATALOG] = JSON.stringify({ version: 1, data: resourceData.catalog });
  expect(() => validatePlanningFarmingAuthoring(pack)).toThrow();
  pack.contents[FARM_CATALOG] = pack.contents[FARM_RULES];
  expect(() => validatePlanningFarmingAuthoring(pack)).toThrow("catalog references a rules");
});
it("reuses unchanged author resources across progress checkpoints and rejects changed content or loader types", () => {
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
  } finally {
    pair.mockRestore();
    parse.mockRestore();
  }
});
it("does not replace validated resource inputs when a later resource rejects a candidate", () => {
  const validate = createPlanningFarmingAuthoringValidator();
  const pack = farmingTestProject();
  const original = pack.contents[FARM_CATALOG];
  const parse = vi.spyOn(JSON, "parse");
  try {
    validate(pack);
    const rejected = structuredClone(pack);
    rejected.contents[FARM_CATALOG] = JSON.stringify({
      version: 1,
      kind: "catalog",
      data: {
        ...resourceData.catalog,
        seeds: resourceData.catalog.seeds.map((seed) => ({ ...seed, name: "Candidate label" }))
      }
    });
    rejected.contents[FARM_RULES] = rejected.contents[FARM_CATALOG];
    expect(() => validate(rejected)).toThrow("rules references a catalog");
    validate(pack);
    expect(parse.mock.calls.filter(([text]) => text === original)).toHaveLength(1);
  } finally {
    parse.mockRestore();
  }
});
it("rejects mismatched data versions without invalidating the successful cache", () => {
  const validate = createPlanningFarmingAuthoringValidator();
  const pack = farmingTestProject();
  const catalog = pack.contents[FARM_CATALOG];
  const parse = vi.spyOn(JSON, "parse");
  try {
    validate(pack);
    const candidate = structuredClone(pack);
    candidate.contents[FARM_RULES] = JSON.stringify({
      version: 1,
      kind: "rules",
      data: { ...resourceData.rules, version: resourceData.rules.version + 1 }
    });
    expect(() => validate(candidate)).toThrow(/catalog and rules data versions must match/);
    candidate.contents[FARM_RULES] = JSON.stringify({
      version: 1,
      kind: "rules",
      data: { ...resourceData.rules, simulationConfig: { cropGrowthMultiplier: 2 } }
    });
    validate(candidate);
    expect(parse.mock.calls.filter(([text]) => text === catalog)).toHaveLength(1);
  } finally {
    parse.mockRestore();
  }
});
it("rejects invalid storage rules without a catalog and inherits valid default storage", () => {
  const storage = {
    ...DEFAULT_STORAGE_DEFINITIONS,
    containers: DEFAULT_STORAGE_DEFINITIONS.containers.map((container) => ({ ...container, width: 0 }))
  };
  const encode = (data: object) => parseFarmingResourceFile(JSON.stringify({ version: 1, kind: "rules", data }));
  expect(() => validateFarmingResourceFile(encode({ ...resourceData.rules, storage }))).toThrow(
    "Invalid container definition"
  );
  expect(() => validateFarmingResourceFile(encode({ ...resourceData.rules, storage: undefined }))).not.toThrow();
});
it("rejects a bad effective Prefab pair during publish and undo, and saves only the accepted pair", async () => {
  const pack = farmingTestProject();
  const source = JSON.parse(pack.contents[FARM_SCENE] as string) as GalaceanSourceSceneFile;
  const prefab = "Farm/Test.prefab";
  const override = "Farm/Override.rules.json";
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
    { virtualPath: override, path: override, type: "JSON", dependencies: [] }
  );
  pack.contents[prefab] = JSON.stringify({
    asset: source.asset,
    root,
    entities: source.entities,
    components: source.components
  });
  pack.contents[FARM_SCENE] = JSON.stringify({
    ...source,
    entities: [
      {
        id: root,
        instance: {
          asset: { $ref: prefab },
          overrides: {
            componentProps: [{ target: source.components[0].id, props: { rules: { $ref: override } } }]
          }
        }
      }
    ],
    components: []
  } satisfies GalaceanSourceSceneFile);
  pack.contents[override] = invalidText; // This history baseline represents a save from the old validator.
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
it("reports committed authoring separately from activation failure", async () => {
  const transaction = {
    run: vi.fn(async () => {}),
    prepare: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    activate: vi.fn(async () => {
      throw Error("Consumer unavailable");
    }),
    complete: vi.fn(async () => {})
  };
  const editor = { beginEdit: () => transaction } as unknown as Pick<RuntimeEditor, "beginEdit">;
  expect(await setPlanningFarmingGrowth(editor, "Farm.scene", 0)).toEqual({
    committed: true,
    activationError: "Error: Consumer unavailable"
  });
  expect(transaction.commit).toHaveBeenCalledOnce();
  expect(transaction.complete).toHaveBeenCalledOnce();
});
it("propagates precommit failure without claiming acceptance", async () => {
  const transaction = {
    run: vi.fn(async () => {}),
    prepare: vi.fn(async () => {
      throw Error("Invalid authoring");
    }),
    commit: vi.fn(),
    complete: vi.fn(async () => {})
  };
  const editor = { beginEdit: () => transaction } as unknown as Pick<RuntimeEditor, "beginEdit">;
  await expect(setPlanningFarmingGrowth(editor, "Farm.scene", 0)).rejects.toThrow("Invalid authoring");
  expect(transaction.commit).not.toHaveBeenCalled();
  expect(transaction.complete).toHaveBeenCalledOnce();
});
