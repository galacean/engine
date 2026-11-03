import { generateBuildingScene, type GeneratedBuildingGroup } from "../components/BuildingSceneGeneration";

/** Offline import of the three recovered examples. The saved result is a native
 * Prefab; runtime creation never reads or converts a MasonryDocument. */
export function exportBuildingPrefab(
  group: GeneratedBuildingGroup,
  assets: string,
  name: string
): GalaceanSourcePrefabFile {
  const source = generateBuildingScene([group], assets);
  if (source.rootEntities.length !== 1) throw Error("A building preset requires one group");
  const entities = new Map(
    source.entities.map((entity, index) => [entity.id, `entity-${String(index).padStart(6, "0")}`])
  );
  // The compiler resolves contacts in stable component-ID order. Preserve the
  // recovered source body order, even when its original names sort differently.
  const components = new Map(
    source.components.map((component, index) => [component.id, `component-${String(index).padStart(6, "0")}`])
  );
  const root = entities.get(source.rootEntities[0])!;
  return {
    asset: { version: "2.0" },
    root,
    entities: source.entities.map((entity) => ({
      ...entity,
      id: entities.get(entity.id)!,
      ...(entity.id === source.rootEntities[0] ? { name } : {}),
      ...(entity.children ? { children: entity.children.map((id) => entities.get(id)!) } : {}),
      ...(entity.components ? { components: entity.components.map((id) => components.get(id)!) } : {})
    })),
    components: source.components.map((component) => ({ ...component, id: components.get(component.id)! }))
  };
}
