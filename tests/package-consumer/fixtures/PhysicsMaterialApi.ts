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
shape.getInstanceMaterial().bounciness = 0.5;
shape.material = null;

const material = new PhysicsMaterial();
const owned = new PhysicsMaterial(engine);
const resource: ReferResource<Engine | null> = material;
const object: EngineObject<Engine | null> = resource;
const owner: Engine | null = object.engine;
if (owner) owner.resourceManager.gc();
if (owned.engine) owned.engine.resourceManager.gc();

// @ts-expect-error A physics material may have no engine owner.
material.engine.resourceManager.gc();

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
  if (loaded.engine) loaded.engine.resourceManager.gc();
});
