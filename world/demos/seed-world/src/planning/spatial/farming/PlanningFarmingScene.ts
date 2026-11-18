import { farmingResourceData } from "@galacean/engine-farming/farming/native/FarmingResources";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";
import type { FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/FarmDefinitions";
import { PLANNING_FARMING_PROJECT_PATH, PLANNING_FARMING_PROJECT_TYPE } from "./PlanningFarmRepository.ts";
import { planningFarmingAssetFormats, planningFarmingStatePath, PLANNING_FARM_CATALOG, PLANNING_FARM_RULES } from "./PlanningFarmingAssets.ts";
import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";

/** Resolve authoring without allocating a native Scene, including the planning page. */
export function planningFarmingProjectStatePath(project: Pick<RuntimeProjectSession, "projectPackage">): string | undefined {
  const pack = project.projectPackage, path = pack.project.scene;
  const scene = new RuntimeSceneEdit(new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({}))), path);
  const systems = scene.queryComponents({ type: "FarmingSystem" });
  if (systems.length > 1) throw Error("Scene has multiple farming systems");
  if (!systems.length)
    return pack.documents?.[`${path}.farming-preset.json`] === undefined ? PLANNING_FARMING_PROJECT_PATH : undefined;
  const component = scene.readComponent(systems[0].id);
  return component.props?.state === undefined ? PLANNING_FARMING_PROJECT_PATH : planningFarmingStatePath(component);
}

/** Preset upgrade preserves authored identities, existing state and explicit component removal. */
export async function preparePlanningFarmingScene(
  project: RuntimeProjectSession,
  options: {
    baseUrl: string;
    definitions?: FarmingDefinitionSet;
  }
): Promise<void> {
  const path = project.projectPackage.project.scene;
  const marker = `${path}.farming-preset.json`;
  const initialized = project.projectPackage.documents?.[marker];
  if (initialized !== undefined) {
    const value = JSON.parse(initialized);
    if (![1, 2].includes(value?.version) || value.scene !== path)
      throw new Error(`Invalid farming preset record '${marker}'`);
    if (value.version === 2) return;
  }
  await project.update((current) => {
    const formats = new Map([...nativeAssetFormats(() => ({})), ...planningFarmingAssetFormats]);
    // Only this preset transaction seeds empty state. Live writes remain repository-owned.
    formats.set(PLANNING_FARMING_PROJECT_TYPE, { validate: () => {}, references: () => [], referenceTypes: [] });
    const initial = structuredClone(current);
    const source = JSON.parse(initial.contents[path] as string) as GalaceanSourceSceneFile;
    const existingSystems = source.components.filter((component) => component.type === "FarmingSystem");
    const addSystem = initialized === undefined && existingSystems.length === 0;
    const needsCatalog = addSystem || existingSystems.some((component) => component.props?.catalog === undefined);
    const data = farmingResourceData(options.definitions ?? FARM_DEFINITIONS);
    const catalog = structuredClone(data.catalog);
    if (needsCatalog && !initial.project.files.some((file) => file.virtualPath === PLANNING_FARM_CATALOG)) {
      catalog.plants = catalog.plants.map((plant) => {
        const compressed = /\.ktx2(?:[?#]|$)/i.test(plant.atlasUrl) || /^data:image\/ktx2[;,]/i.test(plant.atlasUrl);
        const texture = `World/Farming/Textures/${plant.id}.${compressed ? "ktx2" : "png"}`;
        const type = compressed ? "KTX2" : "Texture";
        const existing = initial.project.files.find((file) => file.virtualPath === texture);
        if (existing && existing.type !== type) throw new Error(`Farming texture path conflict: ${texture}`);
        if (!existing) {
          new RuntimeProjectEdit(initial, formats).assertDestination(texture);
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
    if (addSystem) {
      const entity = scene.create({ name: "Farming System" });
      scene.addComponent(entity.id, { type: "FarmingSystem" });
    }
    const ensure = (virtualPath: string, type: string, content: string) => {
      const existing = edit.list().find((file) => file.virtualPath === virtualPath);
      if (existing) {
        if (existing.type !== type) throw new Error(`Farming asset path conflict: ${virtualPath}`);
      } else edit.create({ virtualPath, path: `runtime-farming:${virtualPath}`, type }, content);
    };
    for (const identity of scene.queryComponents({ type: "FarmingSystem" })) {
      const component = scene.readComponent(identity.id),
        props: GalaceanSourceValueRecord = {};
      if (component.props?.catalog === undefined) {
        ensure(
          PLANNING_FARM_CATALOG,
          "FarmingResource",
          JSON.stringify({ version: 1, kind: "catalog", data: catalog })
        );
        props.catalog = { $ref: PLANNING_FARM_CATALOG };
      }
      if (component.props?.rules === undefined) {
        ensure(PLANNING_FARM_RULES, "FarmingResource", JSON.stringify({ version: 1, kind: "rules", data: data.rules }));
        props.rules = { $ref: PLANNING_FARM_RULES };
      }
      if (component.props?.state === undefined) {
        ensure(PLANNING_FARMING_PROJECT_PATH, PLANNING_FARMING_PROJECT_TYPE, JSON.stringify({ version: 1, farms: {} }));
        props.state = { $ref: PLANNING_FARMING_PROJECT_PATH };
      }
      scene.updateComponent(component.id, props);
    }
    edit.writeDocument(marker, JSON.stringify({ version: 2, scene: path }));
    return edit.finish();
  });
}
