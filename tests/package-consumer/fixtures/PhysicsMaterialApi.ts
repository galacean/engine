import {
  BoxCollider,
  Engine,
  Entity,
  EngineObject,
  PhysicsMaterial,
  ReferResource,
  Texture2D,
  UnlitMaterial
} from "@galacean/engine";

declare const engine: Engine;

const collider = new Entity(engine).addComponent(BoxCollider);
const assigned: PhysicsMaterial | null = collider.material;
if (assigned) assigned.bounciness = 0.5;
// @ts-expect-error A Collider can use the shared default instead of an assigned material.
collider.material.bounciness = 0.5;
// @ts-expect-error Colliders no longer expose getInstanceMaterial(); assign a cloned or new PhysicsMaterial instead.
collider.getInstanceMaterial();
collider.material = null;

const material = new PhysicsMaterial(engine);
// @ts-expect-error Physics materials require an engine owner.
new PhysicsMaterial();
// @ts-expect-error An engine owner cannot be null.
new PhysicsMaterial(null);
const resource: ReferResource = material;
const object: EngineObject = resource;
const owner: Engine = object.engine;
owner.resourceManager.gc();
const cloneOwner: Engine = material.clone().engine;
cloneOwner.resourceManager.gc();

const texture = new Texture2D(engine, 1, 1);
const ordinaryMaterial = new UnlitMaterial(engine);
const textureOwner: Engine = texture.engine;
const ordinaryOwner: Engine = ordinaryMaterial.engine;
textureOwner.resourceManager.gc();
ordinaryOwner.resourceManager.gc();

const materials: PhysicsMaterial[] = engine.resourceManager.findResourcesByType(PhysicsMaterial);
const load = engine.resourceManager.load<PhysicsMaterial>("surface.physMat");
load.then((loaded) => {
  materials.push(loaded);
  const loadedOwner: Engine = loaded.engine;
  loadedOwner.resourceManager.gc();
});
