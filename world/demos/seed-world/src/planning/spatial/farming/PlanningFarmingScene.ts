import { farmingResourceData, encodeFarmingResourceFile } from "@galacean/engine-farming/farming/native/FarmingResources";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";
import { builtinFarmingPropFiles } from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { Loader } from "@galacean/engine";
import type { FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/FarmDefinitions";
import { PLANNING_FARMING_PROJECT_PATH, PLANNING_FARMING_PROJECT_TYPE } from "./PlanningFarmRepository.ts";
import { planningFarmingAssetFormats, planningFarmingStatePath, PLANNING_FARM_CATALOG, PLANNING_FARM_RULES } from "./PlanningFarmingAssets.ts";
import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { ProjectPathConflictError } from "@galacean/engine-project/project-files/virtual-project-files";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { FARMING_PRESET_VERSION, farmingPresetPath, hasQuarantinedFarm } from "./PlanningFarmingQuarantine.ts";

const REBUILT_FARM_ROOT = "World/Farming/Rebuilt";

function allocateRebuiltFarmRoot(edit: RuntimeProjectEdit): string {
  for (let suffix = 1; ; suffix++) {
    const root = suffix === 1 ? REBUILT_FARM_ROOT : `${REBUILT_FARM_ROOT}-${suffix}`;
    try {
      edit.assertDestination(root);
      return root;
    } catch (error) {
      if (!(error instanceof ProjectPathConflictError) || ![root, `${root}.meta`].includes(error.existingPath)) throw error;
    }
  }
}

/** Resolve authoring without allocating a native Scene, including the planning page. */
export function planningFarmingProjectStatePath(project: Pick<RuntimeProjectSession, "projectPackage">): string | undefined {
  const pack = project.projectPackage, path = pack.project.scene;
  const scene = new RuntimeSceneEdit(new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({}))), path);
  const systems = scene.queryComponents({ type: "FarmingSystem" });
  if (systems.length > 1) throw Error("Scene has multiple farming systems");
  if (!systems.length)
    return pack.documents?.[farmingPresetPath(path)] === undefined && !hasQuarantinedFarm(pack)
      ? PLANNING_FARMING_PROJECT_PATH : undefined;
  return planningFarmingStatePath(scene.readComponent(systems[0].id));
}

/** Create the current preset once. Existing components, assets and saves remain author-owned. */
export async function preparePlanningFarmingScene(
  project: RuntimeProjectSession,
  options: {
    baseUrl: string;
    definitions?: FarmingDefinitionSet;
    rebuildQuarantinedFarm?: boolean;
  }
): Promise<void> {
  const path = project.projectPackage.project.scene;
  const marker = farmingPresetPath(path);
  const initialized = project.projectPackage.documents?.[marker];
  if (initialized !== undefined) {
    const value = JSON.parse(initialized);
    if (value?.version !== FARMING_PRESET_VERSION || value.scene !== path)
      throw new Error(`Invalid farming preset record '${marker}'`);
    return;
  }
  const rebuilt = hasQuarantinedFarm(project.projectPackage);
  if (rebuilt && !options.rebuildQuarantinedFarm) return;
  const formats = new Map([...nativeAssetFormats(() => ({})), ...planningFarmingAssetFormats]);
  // Only this preset transaction seeds empty state. Live writes remain repository-owned.
  formats.set(PLANNING_FARMING_PROJECT_TYPE, { validate: () => {}, references: () => [], referenceTypes: [] });
  const propSources = new Map<string, string>();
  if (rebuilt) {
    const current = new Map(project.projectPackage.project.files.map((file) => [file.virtualPath, file]));
    const missing = builtinFarmingPropFiles.filter((file) => {
      const existing = current.get(file.virtualPath);
      if (existing && existing.type !== file.type) throw new Error(`Farming prop type conflict: ${file.virtualPath}`);
      return !existing;
    });
    await Promise.all(missing.map(async (file) => {
      if (formats.get(file.type)?.referenceTypes?.length === 0) return;
      const response = await fetch(new URL(file.path, options.baseUrl));
      if (!response.ok) throw new Error(`Read farming prop failed (${response.status}): ${file.virtualPath}`);
      propSources.set(file.virtualPath, await response.text());
    }));
  }
  await project.update((current) => {
    if (current.documents?.[marker] !== undefined) return current;
    const initial = structuredClone(current);
    const draft = new RuntimeProjectEdit(initial, formats);
    const sceneEditor = new RuntimeSceneEdit(draft, path);
    const addSystem = sceneEditor.queryComponents({ type: "FarmingSystem" }).length === 0;
    const rebuiltRoot = rebuilt && addSystem ? allocateRebuiltFarmRoot(draft) : undefined;
    const catalogPath = rebuiltRoot ? `${rebuiltRoot}/Catalog.json` : PLANNING_FARM_CATALOG;
    const rulesPath = rebuiltRoot ? `${rebuiltRoot}/Rules.json` : PLANNING_FARM_RULES;
    const statePath = rebuiltRoot ? `${rebuiltRoot}/State.json` : PLANNING_FARMING_PROJECT_PATH;
    const textures = rebuiltRoot ? `${rebuiltRoot}/Textures` : "World/Farming/Textures";
    const addedProps: string[] = [];
    if (rebuilt) {
      for (const file of builtinFarmingPropFiles) {
        const existing = initial.project.files.find(({ virtualPath }) => virtualPath === file.virtualPath);
        if (existing) {
          if (existing.type !== file.type) throw new Error(`Farming prop type conflict: ${file.virtualPath}`);
          continue;
        }
        draft.assertDestination(file.virtualPath);
        initial.project.files.push({ ...file, path: new URL(file.path, options.baseUrl).href });
        addedProps.push(file.virtualPath);
      }
      for (const virtualPath of addedProps) {
        const file = initial.project.files.find((file) => file.virtualPath === virtualPath)!;
        const text = propSources.get(virtualPath);
        if (text === undefined) {
          if (formats.get(file.type)?.referenceTypes?.length !== 0) throw new Error(`Missing farming prop source: ${virtualPath}`);
          continue;
        }
        initial.contents[virtualPath] = file.type === "Prefab"
          ? JSON.stringify(importRuntimeHierarchy(JSON.parse(text), virtualPath, initial.project.files, (name) => Boolean(Loader.getClass(name))))
          : text;
      }
    }
    const data = farmingResourceData(options.definitions ?? FARM_DEFINITIONS);
    const catalog = structuredClone(data.catalog);
    if (addSystem && !initial.project.files.some((file) => file.virtualPath === catalogPath)) {
      catalog.plants = catalog.plants.map((plant) => {
        const compressed = /\.ktx2(?:[?#]|$)/i.test(plant.atlasUrl) || /^data:image\/ktx2[;,]/i.test(plant.atlasUrl);
        const texture = `${textures}/${plant.id}.${compressed ? "ktx2" : "png"}`;
        const type = compressed ? "KTX2" : "Texture";
        const existing = initial.project.files.find((file) => file.virtualPath === texture);
        if (existing && existing.type !== type) throw new Error(`Farming texture path conflict: ${texture}`);
        if (!existing) {
          draft.assertDestination(texture);
          initial.project.files.push({
            virtualPath: texture,
            path: new URL(plant.atlasUrl, options.baseUrl).href,
            type
          });
        }
        return { ...plant, atlasUrl: texture };
      });
    }
    const edit = new RuntimeProjectEdit(initial, formats);
    const scene = new RuntimeSceneEdit(edit, path);
    const ensure = (virtualPath: string, type: string, content: string) => {
      const existing = edit.list().find((file) => file.virtualPath === virtualPath);
      if (existing) {
        if (rebuilt || existing.type !== type) throw new Error(`Farming asset path conflict: ${virtualPath}`);
      } else edit.create({ virtualPath, path: `runtime-farming:${virtualPath}`, type }, content);
    };
    if (addSystem) {
      ensure(catalogPath, "JSON", JSON.stringify(encodeFarmingResourceFile({ version: 1, kind: "catalog", data: catalog })));
      ensure(rulesPath, "JSON", JSON.stringify({ version: 1, kind: "rules", data: data.rules }));
      ensure(statePath, PLANNING_FARMING_PROJECT_TYPE, JSON.stringify({ version: 1, farms: {} }));
      const entity = scene.create({ name: "Farming System" });
      scene.addComponent(entity.id, {
        type: "FarmingSystem",
        props: { catalog: { $ref: catalogPath }, rules: { $ref: rulesPath }, state: { $ref: statePath } }
      });
    }
    edit.writeDocument(marker, JSON.stringify({ version: FARMING_PRESET_VERSION, scene: path }));
    const candidate = edit.finish();
    for (const path of addedProps) compileProjectResource(candidate, path);
    return candidate;
  });
}
