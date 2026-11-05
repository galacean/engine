import { exportPlanningAuthoring, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { decodeVisualAuthoring, encodeVisualAuthoring, PLANNING_VISUAL_AUTHORING, RETIRED_PLANNING_VISUAL_AUTHORING } from "./PlanningVisualAuthoring.ts";
import type { SpatialEntity } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { WATER_COMPONENT, planningWaterSource, planningWaterParameters } from "./PlanningWaterSource.ts";
import type { WaterSourceAuthoring } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";

export const PLANNING_PROJECT_COMPONENT = "PlanningProjectAuthoring";
export const PLANNING_ENTITY_COMPONENT = "PlanningEntityAuthoring";
export const PLANNING_SEED_ARCHIVE_COMPONENT = "PlanningSeedArchiveAuthoring";
export type PlanningProjectMetadata = Omit<PlanningDocument, "entities" | "layoutOverrides">;
export type PlanningSeedArchive = NonNullable<PlanningDocument["layoutOverrides"]>[string];
export type PlanningSeedArchiveMetadata = Omit<PlanningSeedArchive, "entities"> & { seed: string };
export interface PlanningEntityIdentity {
  planningId: string;
  origin?: SpatialEntity["origin"];
  parentId?: string;
  /** Domains not yet promoted to native authoring components. Never contains visual parameters. */
  spatialComponents: SpatialEntity["components"];
}
export interface PlanningSceneComponent { type: string; props: Record<string, unknown> }
/** Engine Scene v2 schema. Parameter entities contain authoring only, never generated geometry. */
export interface PlanningSceneAsset {
  version: "2.0";
  refs: { url: string; key?: string }[];
  entities: { name: string; components: number[]; children?: number[] }[];
  components: PlanningSceneComponent[];
  scene: { name: string; rootEntities: number[]; background: { mode: 0; color: [number, number, number, number] } };
}

/** Identity and the remaining spatial adapter are separate from each native visual component. */
export function splitPlanningEntity(entity: SpatialEntity): { identity: PlanningEntityIdentity; visual: PlanningSceneComponent[] } {
  const spatialComponents = { ...entity.components };
  for (const retired of RETIRED_PLANNING_VISUAL_AUTHORING) delete spatialComponents[retired.component];
  const visual: PlanningSceneComponent[] = [];
  for (const descriptor of PLANNING_VISUAL_AUTHORING) {
    const source = spatialComponents[descriptor.component];
    if (!source) continue;
    visual.push({ type: descriptor.type, props: encodeVisualAuthoring(descriptor, source) });
    delete spatialComponents[descriptor.component];
  }
  const water = planningWaterSource(entity);
  if (entity.id.startsWith("lake:")) delete spatialComponents.lakes;
  if (entity.id.startsWith("river:")) delete spatialComponents.rivers;
  if (water) {
    delete spatialComponents[water.shape.kind === "lake" ? "lakes" : "rivers"];
    const enabled = entity.components[water.shape.kind === "lake" ? "lakes" : "rivers"].values.enabled;
    visual.push({ type: WATER_COMPONENT, props: { authoring: water, ...(enabled === undefined ? {} : { enabled }) } });
  }
  return { identity: { planningId: entity.id, ...(entity.origin !== undefined ? { origin: entity.origin } : {}),
    ...(entity.parent !== undefined ? { parentId: entity.parent } : {}), spatialComponents }, visual };
}

/** Also reads the original Scene v2 authoring envelope without discarding legacy fields. */
export function restorePlanningEntity(name: string, identity: Record<string, unknown>, visual: PlanningSceneComponent[]): SpatialEntity {
  const legacy = identity.authoring as SpatialEntity | undefined;
  const entity: SpatialEntity = legacy ? structuredClone(legacy) : {
    id: identity.planningId as string, name,
    ...(identity.origin !== undefined ? { origin: identity.origin as SpatialEntity["origin"] } : {}),
    ...(identity.parentId !== undefined ? { parent: identity.parentId as string } : {}),
    components: structuredClone(identity.spatialComponents as SpatialEntity["components"] ?? {})
  };
  for (const retired of RETIRED_PLANNING_VISUAL_AUTHORING) delete entity.components[retired.component];
  for (const record of visual) {
    if (record.type === WATER_COMPONENT) {
      const water = planningWaterParameters(record.props.authoring as WaterSourceAuthoring, record.props.enabled !== false);
      if (Object.keys(water).some(key => Object.hasOwn(entity.components, key)))
        throw new Error(`Duplicate native and planning Water authoring for '${entity.id}'`);
      Object.assign(entity.components, water);
      continue;
    }
    if (RETIRED_PLANNING_VISUAL_AUTHORING.some(retired => retired.type === record.type)) continue;
    const descriptor = PLANNING_VISUAL_AUTHORING.find(item => item.type === record.type)!;
    if (Object.hasOwn(entity.components, descriptor.component)) throw new Error("Duplicate native planning component");
    Object.defineProperty(entity.components, descriptor.component, { value: decodeVisualAuthoring(descriptor, record.props),
      writable: true, enumerable: true, configurable: true });
  }
  return entity;
}

export function exportPlanningScene(document: PlanningDocument): PlanningSceneAsset {
  const { entities, layoutOverrides, ...metadata } = exportPlanningAuthoring(document);
  const scene: PlanningSceneAsset = {
    version: "2.0", refs: [],
    scene: { name: "Seed World", rootEntities: [0], background: { mode: 0, color: [0, 0, 0, 1] } },
    entities: [{ name: "Planning authoring", components: [0], children: [] }],
    components: [{ type: PLANNING_PROJECT_COMPONENT, props: { metadata,
      // Preserve the semantic distinction between an absent archive and an explicitly empty archive.
      ...(layoutOverrides !== undefined ? { hasSeedArchives: true } : {}) } }]
  };
  const appendEntities = (records: Record<string, SpatialEntity>, parent: number) => {
    for (const entity of Object.values(records)) {
      const { identity, visual } = splitPlanningEntity(entity);
      for (const record of visual) {
        if (record.type !== "PlanningLighting" || record.props.profileUrl === undefined) continue;
        const url = record.props.profileUrl;
        if (typeof url !== "string" || !url) throw new Error("Invalid lighting profile asset URL");
        let ref = scene.refs.findIndex(item => item.url === url);
        if (ref < 0) ref = scene.refs.push({ url }) - 1;
        delete record.props.profileUrl;
        record.props.profileReference = { url, asset: { $ref: ref } };
      }
      const nativeRefs = (value: unknown): unknown => {
        if (!value || typeof value !== "object") return value;
        if ("$ref" in value && typeof value.$ref === "string") {
          let index = scene.refs.findIndex(ref => ref.url === value.$ref);
          if (index < 0) index = scene.refs.push({ url: value.$ref }) - 1;
          return { $ref: index };
        }
        return Array.isArray(value) ? value.map(nativeRefs) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, nativeRefs(item)]));
      };
      const records = [{ type: PLANNING_ENTITY_COMPONENT, props: identity as unknown as Record<string, unknown> },
        ...visual.map(record => record.type === WATER_COMPONENT ? { ...record, props: nativeRefs(record.props) as Record<string, unknown> } : record)];
      scene.entities[parent].children!.push(scene.entities.length);
      scene.entities.push({ name: entity.name, components: records.map(record => scene.components.push(record) - 1) });
    }
  };
  appendEntities(entities, 0);
  for (const [seed, { entities: archived, ...parameters }] of Object.entries(layoutOverrides ?? {})) {
    const index = scene.entities.length;
    scene.entities[0].children!.push(index);
    scene.entities.push({ name: `Seed ${seed} authoring`, children: [], components: [scene.components.push({
      type: PLANNING_SEED_ARCHIVE_COMPONENT, props: { metadata: { seed, ...parameters } }
    }) - 1] });
    appendEntities(archived, index);
  }
  return scene;
}

/** Legacy document imports remain valid; native Scene files use the same accepted author parameters. */
export function importPlanningScene(value: unknown): PlanningDocument {
  const file = value as PlanningSceneAsset;
  if (file?.version !== "2.0") return value as PlanningDocument;
  if (!Array.isArray(file.components) || !Array.isArray(file.entities) || !Array.isArray(file.scene?.rootEntities))
    throw new Error("Invalid planning Scene");
  const nativeTypes = new Set([PLANNING_PROJECT_COMPONENT, PLANNING_ENTITY_COMPONENT, PLANNING_SEED_ARCHIVE_COMPONENT,
    ...PLANNING_VISUAL_AUTHORING.map(item => item.type), ...RETIRED_PLANNING_VISUAL_AUTHORING.map(item => item.type)]);
  const ownership = new Map<number, number>();
  file.entities.forEach((entity, index) => {
    for (const componentIndex of entity.components) {
      const component = file.components[componentIndex];
      if (!component) throw new Error("Invalid planning component reference");
      if (!nativeTypes.has(component.type)) continue;
      if (ownership.has(componentIndex)) throw new Error("Invalid or duplicate planning component ownership");
      ownership.set(componentIndex, index);
    }
  });
  file.components.forEach((component, index) => {
    if (nativeTypes.has(component.type) && !ownership.has(index)) throw new Error("Invalid or duplicate unowned planning component");
  });
  const projects = file.components.map((component, index) => ({ component, index }))
    .filter(({ component }) => component.type === PLANNING_PROJECT_COMPONENT);
  if (projects.length !== 1) throw new Error("Planning Scene requires one project component");
  const project = projects[0], root = ownership.get(project.index)!;
  if (!file.scene.rootEntities.includes(root)) throw new Error("Planning project must be a Scene root");
  const metadata = project.component.props.metadata as PlanningProjectMetadata & Pick<PlanningDocument, "layoutOverrides">;
  const { layoutOverrides: legacyArchives, ...projectMetadata } = metadata;
  const consumed = new Set<number>([project.index]);
  const readEntities = (parent: number): Record<string, SpatialEntity> => {
    const entities: Record<string, SpatialEntity> = {};
    for (const index of file.entities[parent].children ?? []) {
      const node = file.entities[index];
      if (!node) throw new Error("Invalid planning entity reference");
      const records = node.components.map(index => file.components[index]);
      const identities = records.filter(record => record.type === PLANNING_ENTITY_COMPONENT);
      if (!identities.length) continue;
      if (identities.length !== 1) throw new Error("Invalid or duplicate planning identity component");
      for (const componentIndex of node.components)
        if (file.components[componentIndex].type === PLANNING_ENTITY_COMPONENT ||
          [...PLANNING_VISUAL_AUTHORING, ...RETIRED_PLANNING_VISUAL_AUTHORING].some(item => item.type === file.components[componentIndex].type)) consumed.add(componentIndex);
      const visual = records.filter(record => record.type === WATER_COMPONENT || PLANNING_VISUAL_AUTHORING.some(item => item.type === record.type)).map(record => {
        if (record.type === WATER_COMPONENT) {
          const paths = (value: unknown): unknown => {
            if (!value || typeof value !== "object") return value;
            if ("$ref" in value && typeof value.$ref === "number") {
              const ref = file.refs[value.$ref];
              if (!ref) throw new Error("Invalid Water asset reference");
              return { $ref: ref.url };
            }
            return Array.isArray(value) ? value.map(paths) : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, paths(item)]));
          };
          return { ...record, props: paths(record.props) as Record<string, unknown> };
        }
        if (record.type !== "PlanningLighting" || (record.props.profile === undefined && record.props.profileReference === undefined)) return record;
        const binding = record.props.profileReference as { url?: string; asset?: { $ref?: number } } | undefined;
        const ref = binding ? binding.asset?.$ref : (record.props.profile as { $ref?: number }).$ref;
        if (!Number.isInteger(ref) || !file.refs?.[ref!]?.url) throw new Error("Invalid lighting profile asset reference");
        if (binding && binding.url !== file.refs[ref!].url) throw new Error("Lighting profile identity does not match its asset reference");
        if (binding && record.props.profile !== undefined) throw new Error("Duplicate lighting profile source");
        const { profile: _profile, profileReference: _reference, ...props } = record.props;
        if (props.profileUrl !== undefined) throw new Error("Duplicate lighting profile source");
        return { type: record.type, props: { ...props, profileUrl: file.refs[ref!].url } };
      });
      const entity = restorePlanningEntity(node.name, identities[0].props, visual);
      if (!entity.id || Object.hasOwn(entities, entity.id)) throw new Error("Invalid or duplicate planning entity");
      Object.defineProperty(entities, entity.id, { value: entity, enumerable: true, writable: true, configurable: true });
    }
    return entities;
  };
  const archives = structuredClone(legacyArchives ?? {});
  let hasArchives = legacyArchives !== undefined || project.component.props.hasSeedArchives === true;
  for (const index of file.entities[root].children ?? []) {
    const node = file.entities[index];
    if (!node) throw new Error("Invalid planning archive reference");
    const components = node.components.map(index => file.components[index]).filter(record => record.type === PLANNING_SEED_ARCHIVE_COMPONENT);
    if (!components.length) continue;
    if (components.length !== 1) throw new Error("Duplicate planning seed archive component");
    consumed.add(node.components.find(index => file.components[index].type === PLANNING_SEED_ARCHIVE_COMPONENT)!);
    const { seed, ...parameters } = components[0].props.metadata as PlanningSeedArchiveMetadata;
    if (typeof seed !== "string" || !seed || Object.hasOwn(archives, seed)) throw new Error("Invalid or duplicate planning seed archive");
    Object.defineProperty(archives, seed, { value: { ...parameters, entities: readEntities(index) }, enumerable: true, writable: true, configurable: true });
    hasArchives = true;
  }
  const entities = readEntities(root);
  if ([...ownership.keys()].some(index => !consumed.has(index)))
    throw new Error("Planning components must belong to an active or archived authoring entity");
  return exportPlanningAuthoring({ ...projectMetadata, entities, ...(hasArchives ? { layoutOverrides: archives } : {}) });
}

/** Files use the existing ProjectLoader contract; the caller chooses their project paths. */
export function planningProjectManifest(scenePath: string, scene?: PlanningSceneAsset) {
  return { scene: scenePath, files: [{ id: "planning-scene", virtualPath: scenePath, path: scenePath, type: "Scene" },
    ...(scene?.refs ?? []).map((ref, index) => ({ id: `planning-resource-${index}`, virtualPath: ref.url, path: ref.url, type: "JSON" }))] };
}
