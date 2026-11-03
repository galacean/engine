import type {} from "@galacean/engine-runtime-editor/runtime-editor/generated/editor-source-schema";

/** Create an independent, editable copy of a native building preset. The Scene
 * owns the resulting objects; only resource references remain shared with VFS.
 * A common prefix preserves the preset's stable body/contact order. */
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
  copy.root = root;
  return copy;
}
