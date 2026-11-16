import {
  BoxColliderShape,
  Engine,
  EngineObject,
  PhysicsMaterial,
  ReferResource,
  Texture2D,
  UnlitMaterial
} from "@galacean/engine";

declare const engine: Engine;

const shape = new BoxColliderShape();
const assigned: PhysicsMaterial | null = shape.material;
if (assigned) assigned.bounciness = 0.5;
// @ts-expect-error A shape can use the shared default instead of an assigned material.
shape.material.bounciness = 0.5;
shape.getInstanceMaterial(engine).bounciness = 0.5;
// @ts-expect-error Creating an instance requires an explicit engine owner.
shape.getInstanceMaterial();
shape.material = null;

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
