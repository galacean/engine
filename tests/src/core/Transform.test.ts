import {
  deepClone,
  dependentComponents,
  DependentMode,
  Entity,
  ICloneHook,
  MeshRenderer,
  Scene,
  Script,
  Transform
} from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe("Transform test", function () {
  let engine: WebGLEngine;
  let scene: Scene;
  let entity: Entity;
  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: canvasDOM });
    scene = engine.sceneManager.scenes[0];
    entity = scene.createRootEntity();
  });

  it("World direction", () => {
    const transform = entity.transform;
    transform.position.set(1, -2, 3);
    transform.rotate(0, 45, 0);

    expect(transform.worldForward).to.deep.equal(new Vector3(-0.7071067811865476, -0, -0.7071067811865476));
    expect(transform.worldRight).to.deep.equal(new Vector3(0.7071067811865476, 0, -0.7071067811865476));
    expect(transform.worldUp).to.deep.equal(new Vector3(0, 1, 0));
  });

  it("World Scale", () => {
    const root = scene.createRootEntity();
    root.transform.setScale(1, 2, 3);
    const entity = root.createChild();
    const transform = entity.transform;
    transform.setScale(4, 5, 6);
    transform.setRotation(0, 0, 0);
    expect(transform.lossyWorldScale).to.deep.equal(new Vector3(4, 10, 18));
    transform.setRotation(90, 0, 0);
    expect(transform.lossyWorldScale).to.deep.equal(new Vector3(4, 15, 12));
  });

  it("Parent Dirty", () => {
    const root1 = scene.createRootEntity();
    const root2 = scene.createRootEntity();
    root1.transform.setPosition(1, 1, 1);
    root2.transform.setPosition(0, 0, 0);

    let worldPosition = root2.transform.worldPosition;
    expect(worldPosition.x).to.equal(0);
    expect(worldPosition.y).to.equal(0);
    expect(worldPosition.z).to.equal(0);
    root1.addChild(root2);
    worldPosition = root2.transform.worldPosition;
    expect(worldPosition.x).to.equal(1);
    expect(worldPosition.y).to.equal(1);
    expect(worldPosition.z).to.equal(1);
    scene.addRootEntity(root2);
    worldPosition = root2.transform.worldPosition;
    expect(worldPosition.x).to.equal(0);
    expect(worldPosition.y).to.equal(0);
    expect(worldPosition.z).to.equal(0);

    // Transform
    const parent = new Entity(engine, "parent");
    const child = parent.createChild("child");
    parent.addChild(child);
    const worldMatrix = child.transform.worldMatrix;

    // Replace transform
    parent.addComponent(Transform);

    // Check child transform parent cache
    // @ts-ignore
    expect(parent.transform.instanceId).eq(child.transform._getParentTransform()?.instanceId);
  });

  it("Subclasses of Transform", () => {
    // Create by constructor
    const entity0 = new Entity(engine, "entity");
    expect(entity0.transform instanceof Transform).to.equal(true);
    expect(entity0.transform instanceof SubClassOfTransform).to.equal(false);
    entity0.transform.position.set(1, 2, 3);
    entity0.transform.rotation.set(0, 45, 0);
    entity0.transform.scale.set(1, 2, 3);
    const entity1 = new Entity(engine, "entity", SubClassOfTransform);
    expect(entity1.transform instanceof SubClassOfTransform).to.equal(true);
    entity1.transform.position.set(4, 5, 6);
    entity1.transform.rotation.set(0, 90, 0);
    entity1.transform.scale.set(4, 5, 6);
    (entity1.transform as SubClassOfTransform).size.set(100, 100);

    // Created by createChild
    const entity2 = entity0.createChild();
    expect(entity2.transform instanceof Transform).to.equal(true);
    expect(entity2.transform instanceof SubClassOfTransform).to.equal(false);
    const entity3 = entity0.createChild();
    expect(entity3.transform instanceof Transform).to.equal(true);

    // Created by clone
    const entity4 = entity0.clone();
    expect(entity4.transform instanceof Transform).to.equal(true);
    expect(entity4.transform instanceof SubClassOfTransform).to.equal(false);
    expect(entity4.transform.position).to.deep.include({ x: 1, y: 2, z: 3 });
    expect(entity4.transform.rotation).to.deep.include({ x: 0, y: 45, z: 0 });
    expect(entity4.transform.scale).to.deep.include({ x: 1, y: 2, z: 3 });
    const entity5 = entity1.clone();
    expect(entity5.transform instanceof SubClassOfTransform).to.equal(true);
    expect(entity5.transform.position).to.deep.include({ x: 4, y: 5, z: 6 });
    expect(entity5.transform.rotation).to.deep.include({ x: 0, y: 90, z: 0 });
    expect(entity5.transform.scale).to.deep.include({ x: 4, y: 5, z: 6 });
    expect((entity5.transform as SubClassOfTransform).size).to.deep.include({ x: 100, y: 100 });

    // Add component
    const preTransform0 = entity0.transform;
    const meshRenderer = entity0.addComponent(MeshRenderer);
    const transformIndex = entity0._components.indexOf(preTransform0);
    entity0.addComponent(SubClassOfTransform);
    expect(preTransform0.destroyed).to.equal(true);
    expect(entity0.transform instanceof Transform).to.equal(true);
    expect(entity0.transform instanceof SubClassOfTransform).to.equal(true);
    expect(entity0._components[transformIndex]).to.equal(entity0.transform);
    expect(entity0._components.indexOf(meshRenderer)).to.equal(1);
    expect(entity0.transform.position).to.deep.include({ x: 1, y: 2, z: 3 });
    expect(entity0.transform.rotation.x).to.be.approximately(0, 1e-6);
    expect(entity0.transform.rotation.y).to.be.approximately(45, 1e-6);
    expect(entity0.transform.rotation.z).to.be.approximately(0, 1e-6);
    expect(entity0.transform.scale).to.deep.include({ x: 1, y: 2, z: 3 });

    const preTransform1 = entity1.transform;
    const meshRenderer1 = entity1.addComponent(MeshRenderer);
    const transformIndex1 = entity1._components.indexOf(preTransform1);
    entity1.addComponent(Transform);
    expect(preTransform1.destroyed).to.equal(true);
    expect(entity1.transform instanceof Transform).to.equal(true);
    expect(entity1.transform instanceof SubClassOfTransform).to.equal(false);
    expect(entity1._components[transformIndex1]).to.equal(entity1.transform);
    expect(entity1._components.indexOf(meshRenderer1)).to.equal(1);
    expect(entity1.transform.position).to.deep.include({ x: 4, y: 5, z: 6 });
    expect(entity1.transform.rotation.x).to.be.approximately(0, 1e-6);
    expect(entity1.transform.rotation.y).to.be.approximately(90, 1e-6);
    expect(entity1.transform.rotation.z).to.be.approximately(0, 1e-6);
    expect(entity1.transform.scale).to.deep.include({ x: 4, y: 5, z: 6 });
  });

  it("creates the unique Transform before constructor components", () => {
    const entityWithRenderer = new Entity(engine, "entity-with-renderer", MeshRenderer);
    expect(entityWithRenderer._components[0]).to.equal(entityWithRenderer.transform);
    expect(entityWithRenderer.getComponent(MeshRenderer)).not.to.equal(null);

    const entityWithLateTransform = new Entity(
      engine,
      "entity-with-late-transform",
      MeshRenderer,
      Transform,
      SubClassOfTransform
    );
    const transforms: Transform[] = [];
    entityWithLateTransform.getComponents(Transform, transforms);
    expect(transforms).to.deep.equal([entityWithLateTransform.transform]);
    expect(entityWithLateTransform.transform).to.be.instanceOf(SubClassOfTransform);
    expect(entityWithLateTransform._components[0]).to.equal(entityWithLateTransform.transform);
    expect(entityWithLateTransform._components[1]).to.be.instanceOf(MeshRenderer);

    const clone = entityWithLateTransform.clone();
    expect(clone.transform).to.be.instanceOf(SubClassOfTransform);
    expect(clone._components.map((component) => component.constructor)).to.deep.equal(
      entityWithLateTransform._components.map((component) => component.constructor)
    );
  });

  it("keeps the Transform slot unique while destruction is deferred", () => {
    const deferredEntity = new Entity(engine, "deferred-transform");
    const previous = deferredEntity.transform;
    let replacement: SubClassOfTransform;

    engine._frameInProcess = true;
    try {
      replacement = deferredEntity.addComponent(SubClassOfTransform);
      const transforms: Transform[] = [];
      deferredEntity.getComponents(Transform, transforms);
      expect(previous.pendingDestroy).to.equal(true);
      expect(transforms).to.deep.equal([replacement]);
      expect(deferredEntity._components[0]).to.equal(replacement);
    } finally {
      engine._frameInProcess = false;
      previous.destroy();
    }
  });

  it("rolls back Transform replacement when a dependency prevents it", () => {
    const dependentEntity = new Entity(engine, "dependent-transform", SubClassOfTransform);
    const previous = dependentEntity.transform;
    dependentEntity.addComponent(RequiresSubClassOfTransform);

    expect(() => dependentEntity.addComponent(Transform)).to.throw(
      "Should remove RequiresSubClassOfTransform before remove SubClassOfTransform"
    );
    const transforms: Transform[] = [];
    dependentEntity.getComponents(Transform, transforms);
    expect(dependentEntity.transform).to.equal(previous);
    expect(transforms).to.deep.equal([previous]);
    expect(dependentEntity._components[0]).to.equal(previous);
  });

  it("checks dependencies declared by a replacement Transform", () => {
    const dependentEntity = new Entity(engine, "check-only-dependent-transform");
    const previous = dependentEntity.transform;

    expect(() => dependentEntity.addComponent(CheckOnlyDependentTransform)).to.throw(
      "Should add MeshRenderer before adding CheckOnlyDependentTransform"
    );
    expect(dependentEntity.transform).to.equal(previous);
    expect(dependentEntity._components).to.deep.equal([previous]);
  });

  it("auto adds dependencies declared by a replacement Transform", () => {
    const dependentEntity = new Entity(engine, "auto-add-dependent-transform");
    const replacement = dependentEntity.addComponent(AutoAddDependentTransform);

    expect(dependentEntity.transform).to.equal(replacement);
    expect(dependentEntity._components[0]).to.equal(replacement);
    expect(dependentEntity._components[1]).to.be.instanceOf(MeshRenderer);
    expect(dependentEntity.getComponent(MeshRenderer)).not.to.equal(null);
  });

  it("clone with worldMatrix listener should not produce stale parent cache after reparent", () => {
    class WorldMatrixListener extends Script {
      constructor(entity: Entity) {
        super(entity);
        // @ts-ignore
        entity._updateFlagManager.addListener(() => {
          entity.transform.worldMatrix;
        });
      }
    }

    const source = new Entity(engine, "source");
    const child = source.createChild("child");
    child.transform.setPosition(10, 20, 30);
    child.addComponent(WorldMatrixListener);

    const clone = source.clone();
    const cloneChild = clone.findByName("child");

    const root = scene.createRootEntity("root");
    root.transform.setPosition(1000, 2000, 3000);
    root.addChild(clone);

    const world = cloneChild.transform.worldMatrix;
    expect(world.elements[12]).to.equal(1010);
    expect(world.elements[13]).to.equal(2020);
    expect(world.elements[14]).to.equal(3030);
  });

  it("clone keeps correct world position when a component reads worldMatrix during clone", () => {
    // A component that reads its (world) transform inside `_onClone` — exactly what the engine's own
    // DynamicCollider does (`_onClone` -> `_syncNative` -> `_addNativeShape` reads `lossyWorldScale`).
    // Clone fills children before the parent's own components, so this read resolves the PARENT's
    // `_parentTransformCache` (and sets `_isParentDirty = false`) BEFORE the parent transform's
    // `_parentTransformCache` is cloned. Without `@ignoreClone` that copy overwrites the resolved
    // value with the source's `null`, leaving `cache === null` while `_isParentDirty === false`
    // (a stale cache that is never revalidated), so after reparent the node renders at the origin.
    class WorldReaderOnClone extends Script implements ICloneHook<WorldReaderOnClone> {
      _onClone(target: any): void {
        target.entity.transform.worldMatrix;
      }
    }

    // Source prefab-like subtree, never read/rendered, so its parent caches stay unresolved.
    const source = new Entity(engine, "source-cloneto");
    const layer = source.createChild("layer");
    layer.transform.setPosition(10, 20, 0);
    layer.createChild("leaf").addComponent(WorldReaderOnClone);

    const clone = source.clone();
    const cloneLayer = clone.findByName("layer");

    const holder = scene.createRootEntity("holder-cloneto");
    holder.transform.setPosition(1000, 2000, 0);
    holder.addChild(clone);

    // Must follow holder (1000 + 10, 2000 + 20), not fall back to its local position (10, 20).
    const world = cloneLayer.transform.worldMatrix;
    expect(world.elements[12]).to.equal(1010);
    expect(world.elements[13]).to.equal(2020);
  });
});

class SubClassOfTransform extends Transform {
  @deepClone
  size: Vector2 = new Vector2();
}

@dependentComponents(SubClassOfTransform, DependentMode.CheckOnly)
class RequiresSubClassOfTransform extends Script {}

@dependentComponents(MeshRenderer, DependentMode.CheckOnly)
class CheckOnlyDependentTransform extends Transform {}

@dependentComponents(MeshRenderer, DependentMode.AutoAdd)
class AutoAddDependentTransform extends Transform {}
