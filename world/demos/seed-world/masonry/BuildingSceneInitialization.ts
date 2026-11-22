import type { PrefabResource } from "@galacean/engine";
import type { RuntimeEditor, RuntimeEditorEdit, RuntimeEditPreparation } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import type { ConstructionTerrainSource } from "@galacean/engine-building/building/runtime/TerrainField";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { buildingAssets } from "@galacean/engine-building/building/resources/BuildingAssetKit";
import { hasInitialBuildings, initialBuildingSource } from "@galacean/engine-world-planning/masonry/BuildingInitialSource";
import { seedWorldBootTrace } from "../src/SeedWorldBootTrace.ts";

type AuthoringEdit = Pick<RuntimeEditorEdit, "run" | "withAsset">;
type Inputs = { plan: IslandPlan; terrain: ConstructionTerrainSource };

interface BuildingLayouts {
  generator: string;
  active: string;
  roots: Record<string, string>;
}

export interface BuildingScenePreparationOptions {
  /**
   * Optional supplier returning a `BuildingGeneratorComponent` id whose 0-building startup
   * fast-path skipped boot-time scene mutation. On the first subsequent editor transaction
   * (`startupPlan === undefined`), that generator converges `initialized: true` in-place
   * without running `inputs()`, restoring the one-time initialization invariant.
   */
  readonly bootEmptyInitializedGeneratorId?: () => string | undefined;
}

/** Initialize each layout once. The Scene keeps previous native buildings under inactive layout roots. */
export function buildingScenePreparation(scenePath: string,
  inputs: (edit: AuthoringEdit, signal: AbortSignal) => Promise<Inputs>,
  startupPlan?: IslandPlan,
  options?: BuildingScenePreparationOptions): RuntimeEditPreparation {
  return async (edit, signal, context) => {
    const shared = context?.after.scene(scenePath);
    if (shared && !shared.hasInstances) {
      const generators = shared.components(["BuildingGeneratorComponent"]);
      if (generators.length > 1) throw Error("Scene has multiple building generators");
      const generator = generators[0];
      if (!generator || generator.props?.enabled === false || (!startupPlan && generator.props?.initialized === true)) return;
    }
    const marker = `${scenePath}.building-layouts.json`;
    const selection = await edit.run(({ draft, edited }) => {
      const scene = new RuntimeSceneEdit(draft, scenePath);
      const generators = scene.queryComponents({ type: "BuildingGeneratorComponent" });
      if (generators.length > 1) throw Error("Scene has multiple building generators");
      const identity = generators[0];
      if (!identity) return;
      const generator = scene.readComponent(identity.id);
      const initialized = generator.props?.initialized === true;
      if (generator.props?.enabled === false || (initialized && !startupPlan)) return;
      const raw = draft.preview().documents?.[marker];
      const stored: BuildingLayouts | undefined = raw === undefined ? undefined : JSON.parse(raw);
      if (stored && (!stored.roots || typeof stored.active !== "string")) throw Error("Invalid Seed World building layouts");
      const layouts = stored?.generator === identity.id ? stored : undefined;
      if (initialized && startupPlan && layouts?.active === buildingLayoutKey(startupPlan)) return;
      const entities = scene.list(), parents = new Map(entities.flatMap(entity =>
        (entity.children ?? []).map(child => [child, entity.id] as const)));
      const visited = new Set<string>();
      for (let id: string | undefined = identity.entityId; id; id = parents.get(id)) {
        if (visited.has(id)) throw Error("Building generator has a cyclic parent hierarchy");
        visited.add(id);
        if (entities.find(entity => entity.id === id)?.isActive === false) return;
      }
      if (
        !startupPlan &&
        !initialized &&
        !layouts &&
        identity.id === options?.bootEmptyInitializedGeneratorId?.()
      ) {
        const frames = (scene.readEntity(identity.entityId).children ?? [])
          .filter((id) => id.startsWith("building-group:["));
        if (frames.length === 0) {
          scene.updateComponent(identity.id, { initialized: true });
          edited();
          return;
        }
      }
      return { identity, initialized, layouts };
    });
    if (!selection) return;
    const { plan, terrain } = await inputs(edit, signal);
    signal.throwIfAborted();
    const planHasBuildings = hasInitialBuildings(plan);
    const key = buildingLayoutKey(plan);
    const parent = await edit.run(({ draft, edited }) => {
      const { identity, initialized, layouts } = selection;
      const scene = new RuntimeSceneEdit(draft, scenePath);
      if (startupPlan && !layouts && !planHasBuildings) {
        const frames = (scene.readEntity(identity.entityId).children ?? [])
          .filter((id) => id.startsWith("building-group:["));
        if (frames.length === 0) return undefined;
      }
      const state: BuildingLayouts = layouts ?? { generator: identity.id, active: key, roots: {} };
      const existingIds = new Set(scene.list().map((entity) => entity.id));
      const createRoot = (name: string, isActive: boolean) =>
        scene.create({ name, isActive, parentEntityId: identity.entityId }).id;
      const label = plan.parameters.worldTemplate?.id || "原始布局";
      let needsBuildings = false;
      if (layouts) {
        const previous = state.roots[state.active];
        if (state.active !== key && existingIds.has(previous)) scene.update(previous, { isActive: false });
        const next = state.roots[key];
        if (next) {
          if (existingIds.has(next)) scene.update(next, { isActive: true });
        } else {
          state.roots[key] = createRoot(label, true);
          needsBuildings = true;
        }
      } else {
        const frames = (scene.readEntity(identity.entityId).children ?? [])
          .filter((id) => id.startsWith("building-group:["));
        const next = state.roots[key] = createRoot(label, true);
        for (const id of frames) scene.reparent(id, next, false);
        needsBuildings = !initialized;
      }
      state.active = key;
      draft.writeDocument(marker, JSON.stringify(state));
      scene.updateComponent(identity.id, { initialized: true });
      edited();
      return needsBuildings ? state.roots[key] : undefined;
    });
    if (!parent || !planHasBuildings) return;
    const fragment = await seedWorldBootTrace.span("building.withAsset", () =>
      edit.withAsset<PrefabResource, Awaited<ReturnType<typeof initialBuildingSource>>>(
        BUILTIN_BUILDING_ASSETS,
        async (assets) => {
          const compilation = buildingAssets(assets.resource).compilation;
          return seedWorldBootTrace.span("building.initialBuildingSource", () =>
            initialBuildingSource(plan, terrain.grid, compilation, BUILTIN_BUILDING_ASSETS, signal, key)
          );
        }
      )
    );
    await edit.run(({ draft, edited }) => {
      signal.throwIfAborted();
      const scene = new RuntimeSceneEdit(draft, scenePath);
      const source = JSON.parse(draft.read(scenePath) as string) as GalaceanSourceSceneFile;
      const ids = new Set([...scene.list(), ...scene.queryComponents()].map(value => value.id));
      if ([...fragment.entities, ...fragment.components].some(value => ids.has(value.id))) throw Error("Generated building identity conflicts with Scene");
      // Preserve generated stable IDs. When parent is a regular source entity (always true for
      // layout roots), attach rootEntities directly in one JSON write instead of N sequential reparents.
      const parentEntity = source.entities.find((entity) => entity.id === parent);
      source.entities.push(...fragment.entities); source.components.push(...fragment.components);
      if (parentEntity && !parentEntity.instance) {
        (parentEntity.children ??= []).push(...fragment.rootEntities);
        draft.update(scenePath, JSON.stringify(source));
      } else {
        source.scene.rootEntities.push(...fragment.rootEntities);
        draft.update(scenePath, JSON.stringify(source));
        scene.batch(() => {
          for (const root of fragment.rootEntities) scene.reparent(root, parent, false);
        });
      }
      edited();
    });
  };
}

function buildingLayoutKey(plan: IslandPlan): string {
  return JSON.stringify([plan.parameters.seed, plan.parameters.worldTemplate?.id ?? ""]);
}

/**
 * Fast-path check for 0-building startup scenes without opening a heavyweight `RuntimeProjectEdit`.
 * Returns `{ skip: true, emptyGeneratorId }` when the scene needs zero boot-time edits, or `{ skip: false }`
 * to fall through to the full `buildingScenePreparation` transaction.
 */
function inspectEmptyStartupBuildingScene(
  project: RuntimeProjectSession,
  plan: IslandPlan
): { skip: false } | { skip: true; emptyGeneratorId?: string } {
  if (hasInitialBuildings(plan)) return { skip: false };
  const scenePath = project.projectPackage.project.scene;
  const marker = `${scenePath}.building-layouts.json`;
  if (project.projectPackage.documents?.[marker] !== undefined) return { skip: false };
  const rawScene = project.projectPackage.contents[scenePath];
  if (typeof rawScene !== "string") return { skip: false };
  let source: GalaceanSourceSceneFile;
  try {
    source = JSON.parse(rawScene) as GalaceanSourceSceneFile;
  } catch {
    return { skip: false };
  }
  const entities = source.entities ?? [];
  if (entities.some((entity) => Boolean((entity as { instance?: unknown }).instance))) return { skip: false };
  const components = source.components ?? [];
  const generators = components.filter((component) => component.type === "BuildingGeneratorComponent");
  if (generators.length > 1) return { skip: false };
  const generator = generators[0];
  if (!generator) return { skip: true };
  if (generator.props?.enabled === false || generator.props?.initialized === true) return { skip: true };
  const owner = entities.find((entity) => (entity.components ?? []).includes(generator.id));
  if (!owner) return { skip: false };
  const parents = new Map<string, string>();
  for (const entity of entities) {
    for (const child of entity.children ?? []) parents.set(child, entity.id);
  }
  const visited = new Set<string>();
  for (let id: string | undefined = owner.id; id; id = parents.get(id)) {
    if (visited.has(id)) return { skip: false };
    visited.add(id);
    if (entities.find((entity) => entity.id === id)?.isActive === false) return { skip: true };
  }
  const frames = (owner.children ?? []).filter((id) => id.startsWith("building-group:["));
  if (frames.length > 0) return { skip: false };
  return { skip: true, emptyGeneratorId: generator.id };
}

/** Bootstrap outside an outer project activation. Later edits use the
 * same preparation in their outer transaction, including marker and children.
 * Returns the `BuildingGeneratorComponent` id if a 0-building startup fast-path skipped boot-time mutation.
 */
export async function initializeBuildingScene(project: RuntimeProjectSession, editor: RuntimeEditor,
  plan: IslandPlan, terrain: ConstructionTerrainSource, signal: AbortSignal): Promise<string | undefined> {
  const fastCheck = inspectEmptyStartupBuildingScene(project, plan);
  if (fastCheck.skip) return fastCheck.emptyGeneratorId;
  const edit = editor.beginEdit(crypto.randomUUID(), signal);
  try {
    await seedWorldBootTrace.span("building.preparation", () =>
      buildingScenePreparation(project.projectPackage.project.scene, async () => ({ plan, terrain }), plan)(edit, signal)
    );
    if (!edit.hasChanges()) return undefined;
    await seedWorldBootTrace.span("building.edit.prepare", () => edit.prepare(signal));
    await seedWorldBootTrace.span("building.edit.commit", () => edit.commit());
    await seedWorldBootTrace.span("building.edit.activate", () => edit.activate(signal));
    return undefined;
  } finally { edit.discard(); }
}
