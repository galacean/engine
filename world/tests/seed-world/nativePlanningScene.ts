import { Entity } from "@galacean/engine-core";
/** Native Entity hierarchy with GPU/engine scheduling substituted. Water owns real
 * components, resources, transactions and query routing in these CPU tests. */
export function nativePlanningScene(engine: any) {
  Object.assign((engine.resourceManager ??= {}), {
    _addReferResource() {},
    _deleteReferResource() {},
    _deleteAsset() {},
    _deleteContentRestorer() {}
  });
  const roots: Entity[] = [];
  const scene: any = { ambientLight: { specularIntensity: 1 }, rootEntities: roots };
  const bind = (entity: Entity): Entity => {
    Object.defineProperty(entity, "scene", { get: () => scene, configurable: true });
    Object.defineProperty(entity, "isActiveInHierarchy", { get: () => true, configurable: true });
    const create = entity.createChild.bind(entity);
    entity.createChild = ((name: string) => bind(create(name))) as typeof entity.createChild;
    return entity;
  };
  scene.createRootEntity = (name: string) => {
    const entity = bind(new Entity(engine, name));
    roots.push(entity);
    return entity;
  };
  return { scene, root: scene.createRootEntity("Planning test scene") as Entity };
}
