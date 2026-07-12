import { deepClone, Entity, Scene, Script, Transform } from "@galacean/engine-core";
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
    entity0.addComponent(SubClassOfTransform);
    expect(preTransform0.destroyed).to.equal(true);
    expect(entity0.transform instanceof Transform).to.equal(true);
    expect(entity0.transform instanceof SubClassOfTransform).to.equal(true);
    expect(entity0.transform.position).to.deep.include({ x: 1, y: 2, z: 3 });
    expect(entity0.transform.rotation).to.deep.include({ x: 0, y: 45, z: 0 });
    expect(entity0.transform.scale).to.deep.include({ x: 1, y: 2, z: 3 });

    const preTransform1 = entity1.transform;
    entity1.addComponent(Transform);
    expect(preTransform1.destroyed).to.equal(true);
    expect(entity1.transform instanceof Transform).to.equal(true);
    expect(entity1.transform instanceof SubClassOfTransform).to.equal(false);
    expect(entity1.transform.position).to.deep.include({ x: 4, y: 5, z: 6 });
    expect(entity1.transform.rotation).to.deep.include({ x: 0, y: 90, z: 0 });
    expect(entity1.transform.scale).to.deep.include({ x: 4, y: 5, z: 6 });
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
    // A component that reads its (world) transform inside `_cloneTo` — exactly what the engine's own
    // DynamicCollider does (`_cloneTo` -> `_syncNative` -> `_addNativeShape` reads `lossyWorldScale`).
    // Clone fills children before the parent's own components, so this read resolves the PARENT's
    // `_parentTransformCache` (and sets `_isParentDirty = false`) BEFORE the parent transform's
    // `_parentTransformCache` is cloned. Without `@ignoreClone` that copy overwrites the resolved
    // value with the source's `null`, leaving `cache === null` while `_isParentDirty === false`
    // (a stale cache that is never revalidated), so after reparent the node renders at the origin.
    class WorldReaderOnClone extends Script {
      _cloneTo(target: any): void {
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
