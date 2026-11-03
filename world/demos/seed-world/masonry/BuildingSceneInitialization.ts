import type { PrefabResource } from "@galacean/engine";
import type { RuntimeEditor, RuntimeEditorEdit, RuntimeEditPreparation } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { prepareConstructionTerrain, type ConstructionTerrainSource } from "@galacean/engine-building/tiny-glade/runtime/ConstructionTerrain";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { generateBuildingScene } from "@galacean/engine-building/tiny-glade/components/BuildingSceneGeneration";
import { BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/tiny-glade/resources/BuiltinBuildingAssets";
import { buildingAssets } from "@galacean/engine-building/tiny-glade/resources/BuildingAssetKit";
import { constructionPreview } from "@galacean/engine-building/tiny-glade/runtime/ConstructionPreview";
import { initialBuildingGroups } from "@galacean/engine-world-planning/integrations/building/InitialBuildingRecipe";

type AuthoringEdit = Pick<RuntimeEditorEdit, "run" | "withAsset">;
type Inputs = { plan: IslandPlan; terrain: ConstructionTerrainSource };

/** One-shot authoring, before runtime activation. Query the draft (including
 * Prefab overrides), never the previous native projection. */
export function buildingScenePreparation(scenePath: string,
  inputs: (edit: AuthoringEdit, signal: AbortSignal) => Promise<Inputs>): RuntimeEditPreparation {
  return async (edit, signal) => {
    const identity = await edit.run(({ draft }) => {
      const scene = new RuntimeSceneEdit(draft, scenePath);
      const generators = scene.queryComponents({ type: "BuildingGeneratorComponent" });
      if (generators.length > 1) throw Error("Scene has multiple building generators");
      const identity = generators[0];
      if (!identity) return;
      const generator = scene.readComponent(identity.id);
      if (generator.props?.initialized === true || generator.props?.enabled === false) return;
      const entities = scene.list(), parents = new Map(entities.flatMap(entity =>
        (entity.children ?? []).map(child => [child, entity.id] as const)));
      const visited = new Set<string>();
      for (let id: string | undefined = identity.entityId; id; id = parents.get(id)) {
        if (visited.has(id)) throw Error("Building generator has a cyclic parent hierarchy");
        visited.add(id);
        if (entities.find(entity => entity.id === id)?.isActive === false) return;
      }
      return identity;
    });
    if (!identity) return;
    const { plan, terrain } = await inputs(edit, signal);
    signal.throwIfAborted();
    const fragment = await edit.withAsset<PrefabResource, ReturnType<typeof generateBuildingScene>>(BUILTIN_BUILDING_ASSETS, async assets => {
      const compilation = buildingAssets(assets.resource).compilation;
      const groups: Parameters<typeof generateBuildingScene>[0][number][] = [];
      for (const { document } of initialBuildingGroups(plan, compilation)) {
        signal.throwIfAborted();
        groups.push({ document, geometry: constructionPreview(document, prepareConstructionTerrain(document, terrain.grid).height, undefined,
          { assets: compilation, includeAppearance: true, retainDecorationParts: true }) });
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
      signal.throwIfAborted();
      return generateBuildingScene(groups, BUILTIN_BUILDING_ASSETS);
    });
    await edit.run(({ draft, edited }) => {
      signal.throwIfAborted();
      const scene = new RuntimeSceneEdit(draft, scenePath);
      const source = JSON.parse(draft.read(scenePath) as string) as GalaceanSourceSceneFile;
      const ids = new Set([...scene.list(), ...scene.queryComponents()].map(value => value.id));
      if ([...fragment.entities, ...fragment.components].some(value => ids.has(value.id))) throw Error("Generated building identity conflicts with Scene");
      // Preserve generated stable IDs. The common reparent operation converts
      // these Scene subtrees to instance additions when the owner is inherited.
      source.scene.rootEntities.push(...fragment.rootEntities);
      source.entities.push(...fragment.entities); source.components.push(...fragment.components);
      draft.update(scenePath, JSON.stringify(source));
      for (const root of fragment.rootEntities) scene.reparent(root, identity.entityId, false);
      scene.updateComponent(identity.id, { initialized: true });
      edited();
    });
  };
}

/** Bootstrap outside an outer project activation. Later edits use the
 * same preparation in their outer transaction, including marker and children. */
export async function initializeBuildingScene(project: RuntimeProjectSession, editor: RuntimeEditor,
  plan: IslandPlan, terrain: ConstructionTerrainSource, signal: AbortSignal): Promise<void> {
  const edit = editor.beginEdit(crypto.randomUUID(), signal);
  try {
    await buildingScenePreparation(project.projectPackage.project.scene, async () => ({ plan, terrain }))(edit, signal);
    if (!edit.hasChanges()) return;
    await edit.prepare(signal); await edit.commit(); await edit.activate(signal);
  } finally { edit.discard(); }
}
