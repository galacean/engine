import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { exportPlanningScene, importPlanningScene, PLANNING_PROJECT_COMPONENT, type PlanningSceneAsset } from "../PlanningSceneAsset.ts";
import { exportPlanningAuthoring, upgradePlanningDocument, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { applySpatialCommands } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import type { RuntimeEditPreparation } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { DEFAULT_PLANT_PROJECT_RESOURCES, type PlantProjectResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { SEED_WORLD_DEFAULT_GROUND_WIND_TUNING, validateGroundWindTuning } from "@galacean/engine-vegetation/world/SeedWorldGroundWindTuningModel";
import { PLANNING_VISUAL_AUTHORING, visualAuthoringProperties } from "../PlanningVisualAuthoring.ts";

const ownedProperties = new Map<string, readonly string[]>([
  ...PLANNING_VISUAL_AUTHORING.map(descriptor => [descriptor.type, [...visualAuthoringProperties(descriptor),
    ...(descriptor.type === "PlanningLighting" ? ["profileReference", "profile"] : [])]] as const),
  ["PlanningProjectAuthoring", ["metadata", "hasSeedArchives"]],
  ["PlanningEntityAuthoring", ["planningId", "origin", "parentId", "spatialComponents", "authoring"]],
  ["PlanningSeedArchiveAuthoring", ["metadata"]],
  ["PlanningVegetationResources", ["catalog", "appearance", "production"]],
  ["PlanningGroundWind", ["windEnabled", ...Object.keys(SEED_WORLD_DEFAULT_GROUND_WIND_TUNING).filter(key => key !== "enabled")]]
]);

export function planningVegetationReferences(pack: RuntimeProjectPackage): PlantProjectResources | undefined {
  const content = pack.contents[pack.project.scene];
  if (typeof content !== "string") return undefined;
  const source = JSON.parse(content);
  if (!source.components?.some((component: { type: string }) => component.type === "PlanningVegetationResources")
    && !source.entities?.some((entity: { instance?: unknown }) => entity.instance)) return undefined;
  const scene = new RuntimeSceneEdit(new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({}))), pack.project.scene);
  const owners = scene.queryComponents({ type: "PlanningVegetationResources" });
  if (!owners.length) return undefined;
  if (owners.length !== 1) throw new Error("Scene requires one vegetation resource owner");
  const props = scene.readComponent(owners[0].id).props ?? {};
  return Object.fromEntries(Object.keys(DEFAULT_PLANT_PROJECT_RESOURCES).map(key => {
    const reference = props[key];
    if (!reference || typeof reference !== "object" || !("$ref" in reference) || typeof reference.$ref !== "string")
      throw new Error(`Vegetation ${key} requires a project asset reference`);
    return [key, reference.$ref];
  })) as unknown as PlantProjectResources;
}

export const validatePlanningSource: RuntimeEditPreparation = async edit => {
  await edit.run(({ draft }) => {
    validatePlanningProject(draft.preview());
  }, true);
};

/** Seed World's authored owner is mandatory after import; deleting it cannot silently start a new world. */
export function validatePlanningProject(pack: RuntimeProjectPackage): void {
  const document = planningSourceDocument(pack);
  if (!document) {
    if (pack.documents?.[`${pack.project.scene}.planning-source.json`]) throw new Error("Imported project requires a PlanningProjectAuthoring owner");
    return;
  }
  applySpatialCommands(document, [], planningRegistry);
  if (pack.project.files.some(file => file.virtualPath === DEFAULT_PLANT_PROJECT_RESOURCES.catalog)) {
    const refs = planningVegetationReferences(pack);
    if (!refs) throw new Error("Planning Scene requires a vegetation resource owner");
    for (const [key, type] of [["catalog", "PlantSpecies"], ["appearance", "PlantAppearance"], ["production", "PlantProduction"]] as const)
      if (pack.project.files.find(file => file.virtualPath === refs[key])?.type !== type)
        throw new Error(`Vegetation ${key} requires a ${type} asset`);
  }
  const draft = new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({}))), scene = new RuntimeSceneEdit(draft, pack.project.scene);
  const winds = scene.queryComponents({ type: "PlanningGroundWind" });
  if (winds.length > 1) throw new Error("Scene requires one ground wind owner");
  for (const record of winds) {
    const { windEnabled, ...props } = scene.readComponent(record.id).props ?? {};
    validateGroundWindTuning({ ...SEED_WORLD_DEFAULT_GROUND_WIND_TUNING, ...props,
      ...(windEnabled === undefined ? {} : { enabled: windEnabled as boolean }) });
  }
}

export function planningSourceDocument(pack: RuntimeProjectPackage): PlanningDocument | undefined {
  const content = pack.contents[pack.project.scene];
  if (typeof content !== "string") return undefined;
  const source = JSON.parse(content);
  if (!source.components?.some((component: { type: string }) => component.type === PLANNING_PROJECT_COMPONENT)
    && !source.entities?.some((entity: { instance?: unknown }) => entity.instance)) return undefined;
  return readPlanningProjectSource(new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({}))), pack.project.scene);
}

/** Read the planning subtree through the same Source/Prefab identities as the editor. */
export function readPlanningProjectSource(draft: RuntimeProjectEdit, path: string): PlanningDocument | undefined {
  const scene = new RuntimeSceneEdit(draft, path);
  const projects = scene.queryComponents({ type: PLANNING_PROJECT_COMPONENT });
  if (!projects.length) return undefined;
  if (projects.length !== 1) throw new Error("Scene requires one planning authoring owner");
  const file: PlanningSceneAsset = { version: "2.0", refs: [], entities: [], components: [],
    scene: { name: "Planning authoring", rootEntities: [0], background: { mode: 0, color: [0, 0, 0, 1] } } };
  const references = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    if ("$ref" in value && typeof value.$ref === "string") {
      let index = file.refs.findIndex(ref => ref.url === value.$ref);
      if (index < 0) index = file.refs.push({ url: value.$ref }) - 1;
      return { $ref: index };
    }
    if (Array.isArray(value)) return value.map(references);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, references(item)]));
  };
  const append = (id: string): number => {
    const entity = scene.readEntity(id), index = file.entities.length;
    const node: PlanningSceneAsset["entities"][number] = { name: entity.name ?? "", components: [], children: [] };
    file.entities.push(node);
    for (const identity of scene.queryComponents({ entityId: id })) {
      if (!identity.type.startsWith("Planning")) continue;
      const component = scene.readComponent(identity.id);
      node.components.push(file.components.length);
      file.components.push({ type: component.type, props: references(component.props ?? {}) as Record<string, unknown> });
    }
    for (const child of entity.children ?? []) node.children!.push(append(child));
    return index;
  };
  append(projects[0].entityId);
  return upgradePlanningDocument(importPlanningScene(file));
}

/** Update owned records in the existing Scene. Unrelated objects and stable IDs survive. */
export function writePlanningProjectSource(draft: RuntimeProjectEdit, path: string, document: PlanningDocument): void {
  const desired = exportPlanningScene(document), scene = new RuntimeSceneEdit(draft, path);
  const assets = new Set(draft.list().map(file => file.virtualPath));
  // Existing external lighting is outside the vegetation conversion. Keep its explicit
  // URL adapter; do not turn it into an unresolved project reference or discard authoring.
  for (const component of desired.components) if (component.type === "PlanningLighting") {
    const reference = component.props.profileReference as { url: string } | undefined;
    if (reference && !assets.has(reference.url)) {
      component.props.profileUrl = reference.url;
      delete component.props.profileReference;
    }
  }
  const winds = scene.queryComponents({ type: "PlanningGroundWind" });
  if (winds.length > 1) throw new Error("Scene requires one ground wind owner");
  desired.entities[0].components.push(desired.components.length);
  desired.components.push({ type: "PlanningGroundWind", props: winds[0] ? scene.readComponent(winds[0].id).props ?? {} : {} });
  if (draft.list().some(file => file.virtualPath === DEFAULT_PLANT_PROJECT_RESOURCES.catalog)) {
    const current = scene.queryComponents({ type: "PlanningVegetationResources" });
    if (current.length > 1) throw new Error("Scene requires one vegetation resource owner");
    const props = current[0] ? scene.readComponent(current[0].id).props ?? {}
      : Object.fromEntries(Object.entries(DEFAULT_PLANT_PROJECT_RESOURCES).map(([key, path]) => [key, { $ref: path }]));
    desired.entities[0].components.push(desired.components.length);
    desired.components.push({ type: "PlanningVegetationResources", props });
  }
  const existing = scene.queryComponents({ type: PLANNING_PROJECT_COMPONENT });
  if (existing.length > 1) throw new Error("Scene requires one planning authoring owner");
  const references = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    if ("$ref" in value && typeof value.$ref === "number") return { $ref: desired.refs[value.$ref].url };
    if (Array.isArray(value)) return value.map(references);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, references(item)]));
  };
  const key = (index: number) => {
    const records = desired.entities[index].components.map(index => desired.components[index]);
    const identity = records.find(record => record.type === "PlanningEntityAuthoring");
    const archive = records.find(record => record.type === "PlanningSeedArchiveAuthoring");
    return identity ? identity.props.planningId : archive ? (archive.props.metadata as { seed: string }).seed : undefined;
  };
  const synchronize = (index: number, id: string) => {
    const node = desired.entities[index];
    if (scene.readEntity(id).name !== node.name) scene.update(id, { name: node.name });
    const remaining = new Map(scene.queryComponents({ entityId: id }).filter(record => ownedProperties.has(record.type))
      .map(record => [record.type, record]));
    for (const componentIndex of node.components) {
      const component = desired.components[componentIndex], current = remaining.get(component.type);
      const props = references(component.props) as GalaceanSourceValueRecord;
      if (!current) scene.addComponent(id, { type: component.type, props });
      else {
        // Source records own complete sparse properties. Prefab members use public overrides.
        const source = JSON.parse(draft.read(path) as string) as GalaceanSourceSceneFile;
        const record = source.components.find(record => record.id === current.id);
        if (record) {
          record.props = { ...Object.fromEntries(Object.entries(record.props ?? {}).filter(([key]) =>
            !ownedProperties.get(component.type)!.includes(key))), ...props };
          draft.update(path, JSON.stringify(source));
        }
        else {
          const previous = scene.readComponent(current.id).props ?? {};
          const removed = Object.keys(previous).filter(key => ownedProperties.get(component.type)!.includes(key) && !(key in props));
          if (removed.length) scene.revertComponent(current.id, removed);
          const changed = Object.fromEntries(Object.entries(props).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(previous[key])));
          if (Object.keys(changed).length) scene.updateComponent(current.id, changed);
        }
      }
      remaining.delete(component.type);
    }
    for (const record of remaining.values()) scene.removeComponent(record.id);
    const children = new Map((scene.readEntity(id).children ?? []).map(child => {
      const records = scene.queryComponents({ entityId: child }).map(record => scene.readComponent(record.id));
      const identity = records.find(record => record.type === "PlanningEntityAuthoring");
      const archive = records.find(record => record.type === "PlanningSeedArchiveAuthoring");
      return [identity?.props?.planningId ?? (archive?.props?.metadata as { seed?: string } | undefined)?.seed, child];
    }));
    for (const child of node.children ?? []) {
      const identity = key(child), current = children.get(identity as string);
      synchronize(child, current ?? scene.create({ name: desired.entities[child].name, parentEntityId: id }).id);
      children.delete(identity as string);
    }
    for (const [identity, child] of children) if (identity !== undefined) scene.delete(child);
  };
  synchronize(0, existing[0]?.entityId ?? scene.create({ name: "Planning authoring" }).id);
}

/** Merge independent native component and domain-tool changes, rejecting conflicting author intent. */
export function mergePlanningAuthoring(base: PlanningDocument, current: PlanningDocument, next: PlanningDocument): PlanningDocument {
  const merge = (before: unknown, left: unknown, right: unknown): unknown => {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (same(before, right) || same(left, right)) return left;
    if (same(before, left)) return right;
    const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
    if (record(before) && record(left) && record(right)) {
      return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(left), ...Object.keys(right)])]
        .map(key => [key, merge(before[key], left[key], right[key])]).filter(([, value]) => value !== undefined));
    }
    throw new Error("Conflicting native and planning edits to the same author property");
  };
  // Revision is the session's concurrency counter, not author intent. Native
  // edits and history can restore Source metadata from a different session count.
  return exportPlanningAuthoring({ ...merge({ ...base, revision: 0 }, { ...current, revision: 0 },
    { ...next, revision: 0 }) as PlanningDocument, revision: next.revision });
}
