import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";
import {
  validateBuildingDraft,
  type BuildingBasePart,
  type BuildingGroup,
  type BuildingRelation,
  type BuildingDraft
} from "../parts/architecture/BuildingDraft";

/** Create an independent, editable copy of a native building preset. The Scene
 * owns the resulting objects; only resource references remain shared with VFS.
 * Architectural IDs and appearance seeds remain local to the native frame. */
export function copyBuildingPrefab(prefab: GalaceanSourcePrefabFile, namespace: string): GalaceanSourcePrefabFile {
  if (
    !namespace.trim() ||
    prefab.asset?.version !== "2.0" ||
    !Array.isArray(prefab.entities) ||
    !Array.isArray(prefab.components)
  )
    throw Error("Building creation requires a native v2 Prefab and a nonempty instance namespace");
  const ids = new Set<string>();
  const index = (items: { id: string }[]) =>
    new Map(
      items.map((item) => {
        if (typeof item.id !== "string" || !item.id || ids.has(item.id))
          throw Error("Invalid or duplicate preset identity");
        ids.add(item.id);
        return [item.id, namespace + "/" + item.id];
      })
    );
  const entities = index(prefab.entities),
    components = index(prefab.components);
  const resolve = (map: Map<string, string>, id: string) => {
    const target = map.get(id);
    if (!target) throw Error("Unknown preset reference: " + id);
    return target;
  };
  const root = resolve(entities, prefab.root),
    copy = structuredClone(prefab);
  const references = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if ("$entity" in record) record.$entity = resolve(entities, record.$entity as string);
    if ("$component" in record) {
      if (typeof record.$component !== "string")
        throw Error("Building preset copies require unpacked component references");
      record.$component = resolve(components, record.$component);
    }
    for (const child of Object.values(record)) references(child);
  };
  for (const entity of copy.entities) {
    if (entity.instance) throw Error("Building preset copies require unpacked entities");
    entity.id = resolve(entities, entity.id);
    if (entity.children) entity.children = entity.children.map((id) => resolve(entities, id));
    if (entity.components) entity.components = entity.components.map((id) => resolve(components, id));
  }
  for (const component of copy.components) {
    component.id = resolve(components, component.id);
    references(component.props);
  }
  // Source graph IDs must be unique in the document. Architectural IDs stay
  // local to the copied frame, exactly as for native Prefab.instantiate().
  const owners = new Map<string, string>(),
    parents = new Map<string, string>();
  for (const entity of copy.entities) {
    for (const id of entity.components ?? []) {
      if (owners.has(id)) throw Error("Preset component has multiple owners: " + id);
      owners.set(id, entity.id);
    }
    for (const id of entity.children ?? []) {
      if (parents.has(id)) throw Error("Preset entity has multiple parents: " + id);
      parents.set(id, entity.id);
    }
  }
  const frames = new Map<string, BuildingDraft>();
  for (const component of copy.components) {
    if (!["BuildingPartComponent", "BuildingGroupComponent"].includes(component.type)) continue;
    const owner = owners.get(component.id);
    if (!owner) throw Error("Building preset component requires an Entity owner");
    const reference = component.props?.frame as { $entity?: string } | null | undefined;
    const frame = reference == null ? (parents.get(owner) ?? owner) : reference.$entity;
    if (!frame) throw Error("Building preset frame requires an Entity reference");
    let ancestor: string | undefined = owner;
    const visited = new Set<string>();
    while (ancestor !== frame) {
      if (!ancestor || visited.has(ancestor)) throw Error("Building preset frame must be its Entity or an ancestor");
      visited.add(ancestor);
      ancestor = parents.get(ancestor);
    }
    const draft = frames.get(frame) ?? { groups: [], parts: [], relations: [] };
    if (!component.props?.definition) throw Error("Building preset component requires a definition");
    if (component.type === "BuildingGroupComponent") {
      draft.groups.push(component.props.definition as unknown as BuildingGroup);
    } else {
      draft.parts.push(component.props.definition as unknown as BuildingBasePart);
      draft.relations.push(...((component.props.relations ?? []) as unknown as BuildingRelation[]));
    }
    frames.set(frame, draft);
  }
  for (const draft of frames.values()) validateBuildingDraft(draft);
  copy.root = root;
  return copy;
}
