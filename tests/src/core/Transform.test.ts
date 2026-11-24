import {
  deepClone,
  dependentComponents,
  DependentMode,
  Entity,
  EntityModifyFlags,
  ICloneHook,
  MeshRenderer,
  Scene,
  Script,
  Transform
} from "@galacean/engine-core";
import { Matrix, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
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

  it("installs the final Transform before constructor components", () => {
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
    expect(clone._components[0]).to.equal(clone.transform);
    expect(clone._components.map((component) => component.constructor)).to.deep.equal(
      entityWithLateTransform._components.map((component) => component.constructor)
    );
  });

  it("clones components that depend on the final Transform subtype", () => {
    const source = new Entity(engine, "dependent-transform-clone", SubClassOfTransform);
    source.addComponent(RequiresSubClassOfTransform);

    const clone = source.clone();
    expect(clone.transform).to.be.instanceOf(SubClassOfTransform);
    expect(clone._components[0]).to.equal(clone.transform);
    expect(clone.getComponent(RequiresSubClassOfTransform)).not.to.equal(null);
    expect(clone._components.map((component) => component.constructor)).to.deep.equal(
      source._components.map((component) => component.constructor)
    );
  });

  it("keeps a single Transform while destruction is deferred", () => {
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

    const transforms: Transform[] = [];
    deferredEntity.getComponents(Transform, transforms);
    expect(previous.destroyed).to.equal(true);
    expect(deferredEntity.transform).to.equal(replacement);
    expect(transforms).to.deep.equal([replacement]);
  });

  it("rejects Transform replacement before construction when a dependency prevents it", () => {
    let constructed = false;
    class ReplacementTransform extends Transform {
      constructor(entity: Entity) {
        super(entity);
        constructed = true;
      }
    }

    const dependentEntity = new Entity(engine, "dependent-transform", SubClassOfTransform);
    const previous = dependentEntity.transform;
    dependentEntity.addComponent(RequiresSubClassOfTransform);

    expect(() => dependentEntity.addComponent(ReplacementTransform)).to.throw(
      "Should remove RequiresSubClassOfTransform before remove SubClassOfTransform"
    );
    // Validation runs before construction, so no replacement is ever allocated.
    expect(constructed).to.equal(false);
    const transforms: Transform[] = [];
    dependentEntity.getComponents(Transform, transforms);
    expect(dependentEntity.transform).to.equal(previous);
    expect(transforms).to.deep.equal([previous]);
    expect(dependentEntity._components[0]).to.equal(previous);
  });

  it("keeps the previous Transform when replacement construction fails", () => {
    const entity = new Entity(engine, "failed-transform-replacement");
    const previous = entity.transform;
    previous.position.set(1, 2, 3);

    expect(() => entity.addComponent(ThrowingReplacementTransform)).to.throw("transform construction failed");
    expect(entity.transform).to.equal(previous);
    expect(entity._components).to.deep.equal([previous]);
    expect(previous.position).to.deep.include({ x: 1, y: 2, z: 3 });
    expect(previous.destroyed).to.equal(false);
  });

  it.each([CheckOnlyDependentTransform, AutoAddDependentTransform, InheritedDependentTransform])(
    "rejects dependencies declared by Transform-compatible components: %s",
    (type) => {
      const message = `Transform-compatible component ${type.name} cannot declare component dependencies`;
      expect(() => new Entity(engine, "invalid-transform", type)).to.throw(message);

      const entity = new Entity(engine, "invalid-replacement");
      const previous = entity.transform;
      expect(() => entity.addComponent(type)).to.throw(message);
      expect(entity.transform).to.equal(previous);
      expect(entity._components).to.deep.equal([previous]);
      expect(() => entity.destroy()).not.to.throw();
      expect(previous.destroyed).to.equal(true);
    }
  );

  it("installs AutoAdd dependencies before component construction and destroys the complete entity", () => {
    @dependentComponents(SubClassOfTransform, DependentMode.AutoAdd)
    class TransformReader extends Script {
      constructor(entity: Entity) {
        super(entity);
        expect(entity.transform).to.be.instanceOf(SubClassOfTransform);
        expect(entity.getComponent(SubClassOfTransform)).to.equal(entity.transform);
      }
    }

    const entity = new Entity(engine, "auto-transform-dependency");
    const reader = entity.addComponent(TransformReader);
    const transform = entity.transform;
    expect(entity._components).to.deep.equal([transform, reader]);
    expect(() => entity.destroy()).not.to.throw();
    expect(reader.destroyed).to.equal(true);
    expect(transform.destroyed).to.equal(true);
    expect(entity._components).to.have.lengthOf(0);
  });

  it.each([false, true])(
    "allows component additions from a compatible Transform constructor (initial: %s)",
    (initial) => {
      class AddingTransform extends Transform {
        constructor(entity: Entity) {
          super(entity);
          entity.addComponent(CloneTailComponent);
        }
      }

      const entity = new Entity(engine, "constructor-component", ...(initial ? [AddingTransform] : []));
      const replacement = initial ? entity.transform : entity.addComponent(AddingTransform);
      expect(entity.transform).to.equal(replacement);
      expect(entity._components[0].instanceId).to.equal(replacement.instanceId);
      expect(entity.getComponent(CloneTailComponent)).not.to.equal(null);
      expect(() => entity.destroy()).not.to.throw();
    }
  );

  it("updates cached child world transforms after replacing the parent Transform", () => {
    const entity = scene.createRootEntity("replacement-child-cache");
    entity.transform.setPosition(1, 2, 3);
    const child = entity.createChild();
    child.transform.setPosition(4, 5, 6);
    expect(child.transform.worldPosition).to.deep.include({ x: 5, y: 7, z: 9 });
    expect(Array.from(child.transform.worldMatrix.elements.slice(12, 15))).to.deep.equal([5, 7, 9]);

    const previous = entity.transform;
    const replacement = entity.addComponent(SubClassOfTransform);
    replacement.setPosition(10, 20, 30);

    expect(child.transform.worldPosition).to.deep.include({ x: 14, y: 25, z: 36 });
    expect(Array.from(child.transform.worldMatrix.elements.slice(12, 15))).to.deep.equal([14, 25, 36]);
    expect(previous.destroyed).to.equal(true);
    entity.destroy();
  });

  it("preserves quaternion-authored rotation while replacing Transform", () => {
    const entity = new Entity(engine, "quaternion-transform");
    const expected = new Quaternion();
    Quaternion.rotationEuler(Math.PI / 2 - 1e-7, 0.4, -0.2, expected);
    entity.transform.rotationQuaternion = expected;

    entity.addComponent(SubClassOfTransform);

    expect(Math.abs(Quaternion.dot(entity.transform.rotationQuaternion, expected))).to.be.approximately(1, 1e-6);
  });

  it.each(["replacement", "clone"])("refreshes constructor-read world caches after %s", (operation) => {
    class ReadingTransform extends Transform {
      constructor(entity: Entity) {
        super(entity);
        void this.worldPosition;
        void this.worldRotation;
        void this.worldRotationQuaternion;
        void this.lossyWorldScale;
        void this.worldMatrix;
      }
    }

    const source = new Entity(engine, "cached-pose", ReadingTransform);
    source.transform.setPosition(10, 20, 30);
    source.transform.setRotation(0, 190, 0);
    source.transform.setScale(2, 3, 4);
    const expectedRotation = source.transform.worldRotation.clone();
    const expectedQuaternion = source.transform.worldRotationQuaternion.clone();
    const expectedMatrix = source.transform.worldMatrix.clone();

    const target = operation === "replacement" ? source.addComponent(ReadingTransform) : source.clone().transform;
    expect(target.rotation).to.deep.include({ x: 0, y: 190, z: 0 });
    expect(target.worldPosition).to.deep.include({ x: 10, y: 20, z: 30 });
    expect(Vector3.equals(target.worldRotation, expectedRotation)).to.equal(true);
    expect(Quaternion.equals(target.worldRotationQuaternion, expectedQuaternion)).to.equal(true);
    expect(target.lossyWorldScale).to.deep.include({ x: 2, y: 3, z: 4 });
    expect(Array.from(target.worldMatrix.elements)).to.deep.equal(Array.from(expectedMatrix.elements));

    target.setPosition(40, 50, 60);
    expect(target.worldPosition).to.deep.include({ x: 40, y: 50, z: 60 });
    target.setScale(5, 6, 7);
    expect(target.lossyWorldScale).to.deep.include({ x: 5, y: 6, z: 7 });
    target.setRotation(0, 0, 0);
    expect(target.worldRotationQuaternion).to.deep.include({ x: 0, y: 0, z: 0, w: 1 });
    target.rotationQuaternion.set(0, 0.6, 0, 0.8);
    expect(target.worldRotationQuaternion).to.deep.include({ x: 0, y: 0.6, z: 0, w: 0.8 });

    if (operation === "clone") {
      target.entity.destroy();
    }
    source.destroy();
  });

  it("preserves a non-canonical euler rotation across replacement", () => {
    const entity = new Entity(engine, "non-canonical-euler");
    entity.transform.setRotation(0, 190, 0);

    entity.addComponent(SubClassOfTransform);

    // The euler representation is authoritative, so it must survive verbatim instead of
    // being re-derived from the equivalent quaternion (which would yield -170).
    expect(entity.transform.rotation.x).to.be.approximately(0, 1e-9);
    expect(entity.transform.rotation.y).to.be.approximately(190, 1e-9);
    expect(entity.transform.rotation.z).to.be.approximately(0, 1e-9);
  });

  it("preserves euler rotation at gimbal lock across replacement", () => {
    const entity = new Entity(engine, "gimbal-lock-euler");
    entity.transform.setRotation(90, 0, 30);

    entity.addComponent(SubClassOfTransform);

    // At pitch 90 the quaternion loses the roll/yaw split, so a quaternion round trip would
    // renormalize this pose to (90, -30, 0).
    expect(entity.transform.rotation.x).to.be.approximately(90, 1e-9);
    expect(entity.transform.rotation.y).to.be.approximately(0, 1e-9);
    expect(entity.transform.rotation.z).to.be.approximately(30, 1e-9);
  });

  it("does not allow the current Transform to be destroyed directly", () => {
    const entity = new Entity(engine, "destroy-transform");
    const transform = entity.transform;

    expect(() => transform.destroy()).to.throw(
      "Transform cannot be destroyed directly; replace it by adding another Transform-compatible component"
    );
    expect(transform.destroyed).to.equal(false);
    expect(entity.transform).to.equal(transform);
    expect(entity._components).to.deep.equal([transform]);
  });

  it("keeps component lists and references correct across nested clones", () => {
    const nestedSource = new Entity(engine, "nested-source");
    const source = new Entity(engine, "outer-source");
    const nestedComponent = source.addComponent(NestedCloneComponent);
    const tailComponent = source.addComponent(CloneTailComponent);
    nestedComponent.reference = tailComponent;

    NestedCloneComponent.source = nestedSource;
    const clone = source.clone();

    expect(NestedCloneComponent.result._components).to.deep.equal([NestedCloneComponent.result.transform]);
    const clonedTail = clone.getComponent(CloneTailComponent);
    expect(clonedTail).not.to.equal(tailComponent);
    expect(clone.getComponent(NestedCloneComponent).reference).to.equal(clonedTail);
  });

  it("does not leak component constructors after a failed clone", () => {
    const source = new Entity(engine, "failed-clone");
    source.addComponent(ThrowingCloneComponent);

    ThrowingCloneComponent.throwOnConstruction = true;
    try {
      expect(() => source.clone()).to.throw("clone construction failed");
    } finally {
      ThrowingCloneComponent.throwOnConstruction = false;
    }

    const unrelated = new Entity(engine, "unrelated-clone");
    const clone = unrelated.clone();
    expect(clone._components).to.deep.equal([clone.transform]);
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

  describe("reparent world pose vs local pose", () => {
    it("preserves world pose on entity.parent = newParent while addChild/createChild/removeChild preserve local pose", () => {
      const parentA = scene.createRootEntity("reparentA");
      parentA.transform.setPosition(10, -4, 3);
      parentA.transform.setRotation(0, 90, 0);
      parentA.transform.setScale(2, 2, 2);

      const parentB = scene.createRootEntity("reparentB");
      parentB.transform.setPosition(-5, 6, 2);
      parentB.transform.setRotation(0, 0, 90);
      parentB.transform.setScale(4, 4, 4);

      // createChild keeps local pose (0, 0, 0) rather than preserving detached origin
      const created = parentA.createChild("createdChild");
      expect(created.transform.position).to.deep.include({ x: 0, y: 0, z: 0 });
      expect(created.transform.worldPosition.x).to.be.closeTo(10, 1e-5);
      expect(created.transform.worldPosition.y).to.be.closeTo(-4, 1e-5);
      expect(created.transform.worldPosition.z).to.be.closeTo(3, 1e-5);

      // Move created under parentB via parent setter (never reading worldMatrix on a second child first)
      const child = parentA.createChild("worldChild");
      child.transform.setPosition(1, 2, 3);
      child.transform.setRotation(30, 45, 60);
      child.transform.setScale(1.5, 2.5, 3.5);

      const expectedWorldPos = child.transform.worldPosition.clone();
      const expectedWorldRot = child.transform.worldRotationQuaternion.clone();
      const expectedWorldScale = child.transform.lossyWorldScale.clone();
      const expectedWorldMat = child.transform.worldMatrix.clone();

      child.parent = parentB;

      expect(child.transform.worldPosition.x).to.be.closeTo(expectedWorldPos.x, 1e-4);
      expect(child.transform.worldPosition.y).to.be.closeTo(expectedWorldPos.y, 1e-4);
      expect(child.transform.worldPosition.z).to.be.closeTo(expectedWorldPos.z, 1e-4);
      expect(Math.abs(Quaternion.dot(child.transform.worldRotationQuaternion, expectedWorldRot))).to.be.closeTo(
        1,
        1e-5
      );
      expect(child.transform.lossyWorldScale.x).to.be.closeTo(expectedWorldScale.x, 1e-4);
      expect(child.transform.lossyWorldScale.y).to.be.closeTo(expectedWorldScale.y, 1e-4);
      expect(child.transform.lossyWorldScale.z).to.be.closeTo(expectedWorldScale.z, 1e-4);
      for (let i = 0; i < 16; i++) {
        expect(child.transform.worldMatrix.elements[i]).to.be.closeTo(expectedWorldMat.elements[i], 1e-4);
      }

      // Reparenting a child whose worldMatrix was never read before still resolves oldParent accurately
      const unreadChild = parentA.createChild("unreadChild");
      unreadChild.transform.setPosition(2, 0, 0);
      unreadChild.parent = parentB;
      // Under parentA (pos=(10,-4,3), rotY=90°, scale=2), local (2,0,0) maps to world (10, -4, -1)
      expect(unreadChild.transform.worldPosition.x).to.be.closeTo(10, 1e-4);
      expect(unreadChild.transform.worldPosition.y).to.be.closeTo(-4, 1e-4);
      expect(unreadChild.transform.worldPosition.z).to.be.closeTo(-1, 1e-4);

      // Detaching via parent = null preserves world pose into local TRS
      child.parent = null;
      expect(child.transform.position.x).to.be.closeTo(expectedWorldPos.x, 1e-4);
      expect(child.transform.position.y).to.be.closeTo(expectedWorldPos.y, 1e-4);
      expect(child.transform.position.z).to.be.closeTo(expectedWorldPos.z, 1e-4);
      expect(Math.abs(Quaternion.dot(child.transform.rotationQuaternion, expectedWorldRot))).to.be.closeTo(1, 1e-5);
      expect(child.transform.scale.x).to.be.closeTo(expectedWorldScale.x, 1e-4);
      expect(child.transform.scale.y).to.be.closeTo(expectedWorldScale.y, 1e-4);
      expect(child.transform.scale.z).to.be.closeTo(expectedWorldScale.z, 1e-4);

      // addChild preserves local pose, and removeChild preserves local pose
      const localChild = new Entity(engine, "localChild");
      localChild.transform.setPosition(1, 2, 3);
      parentA.addChild(localChild);
      expect(localChild.transform.position).to.deep.include({ x: 1, y: 2, z: 3 });
      parentA.removeChild(localChild);
      expect(localChild.transform.position).to.deep.include({ x: 1, y: 2, z: 3 });

      parentA.destroy();
      parentB.destroy();
      child.destroy();
      localChild.destroy();
    });

    it("exposes preserved world pose immediately inside onEnable when attaching via entity.parent", () => {
      const parent = scene.createRootEntity("enableParent");
      parent.transform.setPosition(10, 0, 0);

      let enabledWorldPos: Vector3 | null = null;
      let enabledLocalPos: Vector3 | null = null;
      class EnableProbe extends Script {
        override onEnable(): void {
          enabledWorldPos = this.entity.transform.worldPosition.clone();
          enabledLocalPos = this.entity.transform.position.clone();
        }
      }

      const detached = new Entity(engine, "detachedEnableChild");
      detached.transform.setPosition(5, 0, 0);
      detached.addComponent(EnableProbe);

      detached.parent = parent;

      expect(enabledWorldPos).not.to.equal(null);
      expect(enabledWorldPos!.x).to.be.closeTo(5, 1e-5);
      expect(enabledLocalPos!.x).to.be.closeTo(-5, 1e-5);
      expect(detached.transform.worldPosition.x).to.be.closeTo(5, 1e-5);

      parent.destroy();
    });

    it("preserves negative scale sign across entity.parent reparenting", () => {
      const parentA = scene.createRootEntity("negParentA");
      parentA.transform.setRotation(0, 0, 90);
      parentA.transform.setScale(-2, 3, 5);

      const parentB = scene.createRootEntity("negParentB");

      const child = parentA.createChild("negChild");
      const expectedWorldMat = child.transform.worldMatrix.clone();
      const expectedWorldScale = child.transform.lossyWorldScale.clone();

      child.parent = parentB;

      expect(child.transform.scale.x).to.be.closeTo(-2, 1e-5);
      expect(child.transform.scale.y).to.be.closeTo(3, 1e-5);
      expect(child.transform.scale.z).to.be.closeTo(5, 1e-5);
      expect(child.transform.lossyWorldScale.x).to.be.closeTo(expectedWorldScale.x, 1e-5);
      expect(child.transform.lossyWorldScale.y).to.be.closeTo(expectedWorldScale.y, 1e-5);
      expect(child.transform.lossyWorldScale.z).to.be.closeTo(expectedWorldScale.z, 1e-5);
      for (let i = 0; i < 16; i++) {
        expect(child.transform.worldMatrix.elements[i]).to.be.closeTo(expectedWorldMat.elements[i], 1e-5);
      }

      parentA.destroy();
      parentB.destroy();
    });

    it("preserves reflected world matrix without collapsing scale on rotated children under negative-scale parents", () => {
      // Single-axis reflection (-1, 1, 1) with 45° Z child rotation (zero shear, det = -1)
      const flipXParent = scene.createRootEntity("flipXParent");
      flipXParent.transform.setScale(-1, 1, 1);
      const child1 = flipXParent.createChild("flipXChild");
      child1.transform.setRotation(0, 0, 45);
      const expectedFlipXMat = child1.transform.worldMatrix.clone();
      const identityParent = scene.createRootEntity("identityParent");

      child1.parent = identityParent;
      expect(Math.abs(child1.transform.scale.x)).to.be.closeTo(1, 1e-5);
      expect(Math.abs(child1.transform.scale.y)).to.be.closeTo(1, 1e-5);
      expect(Math.abs(child1.transform.scale.z)).to.be.closeTo(1, 1e-5);
      for (let i = 0; i < 16; i++) {
        expect(child1.transform.worldMatrix.elements[i]).to.be.closeTo(expectedFlipXMat.elements[i], 1e-5);
      }

      // Reverse: positive-scale 45° Z child attached under (-1, 1, 1) parent
      const child2 = identityParent.createChild("intoFlipXChild");
      child2.transform.setRotation(0, 0, 45);
      const expectedIntoFlipMat = child2.transform.worldMatrix.clone();
      child2.parent = flipXParent;
      expect(Math.abs(child2.transform.scale.x)).to.be.closeTo(1, 1e-5);
      expect(Math.abs(child2.transform.scale.y)).to.be.closeTo(1, 1e-5);
      expect(Math.abs(child2.transform.scale.z)).to.be.closeTo(1, 1e-5);
      for (let i = 0; i < 16; i++) {
        expect(child2.transform.worldMatrix.elements[i]).to.be.closeTo(expectedIntoFlipMat.elements[i], 1e-5);
      }

      // Two-axis negative scale (-1, -1, 1) with 45° X child rotation (zero shear, det = +1)
      const flipXYParent = scene.createRootEntity("flipXYParent");
      flipXYParent.transform.setScale(-1, -1, 1);
      const child3 = flipXYParent.createChild("flipXYChild");
      child3.transform.setRotation(45, 0, 0);
      const expectedFlipXYMat = child3.transform.worldMatrix.clone();
      child3.parent = identityParent;
      expect(Math.abs(child3.transform.scale.x)).to.be.closeTo(1, 1e-5);
      expect(Math.abs(child3.transform.scale.y)).to.be.closeTo(1, 1e-5);
      expect(Math.abs(child3.transform.scale.z)).to.be.closeTo(1, 1e-5);
      for (let i = 0; i < 16; i++) {
        expect(child3.transform.worldMatrix.elements[i]).to.be.closeTo(expectedFlipXYMat.elements[i], 1e-5);
      }

      // Uniform negative scale (-2, -2, -2) keeps exact uniform scale and rotation without 180° flip
      const uniformNegParent = scene.createRootEntity("uniformNegParent");
      uniformNegParent.transform.setScale(-2, -2, -2);
      const child4 = uniformNegParent.createChild("uniformNegChild");
      child4.transform.setRotation(0, 0, 45);
      const expectedUniformNegMat = child4.transform.worldMatrix.clone();
      child4.parent = identityParent;
      expect(child4.transform.scale.x).to.be.closeTo(-2, 1e-5);
      expect(child4.transform.scale.y).to.be.closeTo(-2, 1e-5);
      expect(child4.transform.scale.z).to.be.closeTo(-2, 1e-5);
      for (let i = 0; i < 16; i++) {
        expect(child4.transform.worldMatrix.elements[i]).to.be.closeTo(expectedUniformNegMat.elements[i], 1e-5);
      }

      flipXParent.destroy();
      flipXYParent.destroy();
      uniformNegParent.destroy();
      identityParent.destroy();
    });

    it("discards shear and rebuilds clean TRS when assigning sheared localMatrix or worldMatrix", () => {
      const a = scene.createRootEntity("setMatA");
      a.transform.setRotation(0, 0, 45);
      const b = a.createChild("setMatB");
      b.transform.setScale(7, 1, 5);
      const c = b.createChild("setMatC");
      c.transform.setRotation(0, 0, -45);
      const d = scene.createRootEntity("setMatD");

      const saved = c.transform.worldMatrix.clone();
      d.addChild(c);
      c.transform.worldMatrix = saved;

      expect(c.transform.scale.x).to.be.closeTo(4, 1e-5);
      expect(c.transform.scale.y).to.be.closeTo(4, 1e-5);
      expect(c.transform.scale.z).to.be.closeTo(5, 1e-5);
      expect(c.transform.lossyWorldScale.x).to.be.closeTo(4, 1e-5);
      expect(c.transform.lossyWorldScale.y).to.be.closeTo(4, 1e-5);
      expect(c.transform.lossyWorldScale.z).to.be.closeTo(5, 1e-5);
      expect(c.transform.rotationQuaternion.length()).to.be.closeTo(1, 1e-5);

      const expectedClean = new Matrix();
      Matrix.scaling(new Vector3(4, 4, 5), expectedClean);
      for (let i = 0; i < 16; i++) {
        expect(c.transform.localMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
        expect(c.transform.worldMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
      }

      // Assigning sheared localMatrix directly on a root entity also rebuilds clean TRS
      const rootSheared = scene.createRootEntity("rootSheared");
      rootSheared.transform.localMatrix = saved;
      expect(rootSheared.transform.scale.x).to.be.closeTo(4, 1e-5);
      expect(rootSheared.transform.scale.y).to.be.closeTo(4, 1e-5);
      expect(rootSheared.transform.scale.z).to.be.closeTo(5, 1e-5);
      expect(rootSheared.transform.lossyWorldScale.x).to.be.closeTo(4, 1e-5);
      expect(rootSheared.transform.lossyWorldScale.y).to.be.closeTo(4, 1e-5);
      expect(rootSheared.transform.lossyWorldScale.z).to.be.closeTo(5, 1e-5);
      for (let i = 0; i < 16; i++) {
        expect(rootSheared.transform.localMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
        expect(rootSheared.transform.worldMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
      }

      // Clean worldMatrix under non-uniform parent that induces local shear rebuilds consistent worldMatrix
      const nonUniformParent = scene.createRootEntity("nonUniformSetWorld");
      nonUniformParent.transform.setScale(7, 1, 5);
      const childUnderNonUniform = nonUniformParent.createChild("childUnderNonUniform");
      const rot45 = new Matrix();
      const q45 = new Quaternion();
      Quaternion.rotationZ(Math.PI / 4, q45);
      Matrix.rotationQuaternion(q45, rot45);
      childUnderNonUniform.transform.worldMatrix = rot45;
      const expectedWorld = new Matrix();
      Matrix.multiply(
        nonUniformParent.transform.worldMatrix,
        childUnderNonUniform.transform.localMatrix,
        expectedWorld
      );
      for (let i = 0; i < 16; i++) {
        expect(childUnderNonUniform.transform.worldMatrix.elements[i]).to.be.closeTo(expectedWorld.elements[i], 1e-5);
      }

      a.destroy();
      d.destroy();
      rootSheared.destroy();
      nonUniformParent.destroy();
    });

    it("commits preserved transform before dispatching EntityModifyFlags.Child listeners", () => {
      const parentA = scene.createRootEntity("childEventParentA");
      const parentB = scene.createRootEntity("childEventParentB");
      parentA.transform.setPosition(10, 0, 0);
      parentB.transform.setPosition(4, 0, 0);

      const child = parentA.createChild("childEventTarget");
      child.transform.setPosition(2, 0, 0); // world x = 12

      let observedLocalX = NaN;
      let observedWorldX = NaN;
      // @ts-ignore
      parentA._registerModifyListener((flag: EntityModifyFlags) => {
        if (flag === EntityModifyFlags.Child) {
          // Mutating oldParent inside its Child callback must not corrupt child's captured world pose
          parentA.transform.setPosition(999, 0, 0);
        }
      });
      // @ts-ignore
      parentB._registerModifyListener((flag: EntityModifyFlags) => {
        if (flag === EntityModifyFlags.Child) {
          observedLocalX = child.transform.position.x;
          observedWorldX = child.transform.worldPosition.x;
        }
      });

      child.parent = parentB;

      expect(observedLocalX).to.be.closeTo(8, 1e-5);
      expect(observedWorldX).to.be.closeTo(12, 1e-5);
      expect(child.transform.position.x).to.be.closeTo(8, 1e-5);
      expect(child.transform.worldPosition.x).to.be.closeTo(12, 1e-5);

      parentA.destroy();
      parentB.destroy();
    });

    it("drops shear cleanly into consistent TRS on entity.parent reparent (A->B->C to D and null)", () => {
      const a = scene.createRootEntity("shearA");
      a.transform.setRotation(0, 0, 45);
      const b = a.createChild("shearB");
      b.transform.setScale(7, 1, 5);
      const c = b.createChild("shearC");
      c.transform.setRotation(0, 0, -45);
      const d = scene.createRootEntity("shearD");

      // Before reparent: sheared worldMatrix [[4,3,0,0],[3,4,0,0],[0,0,5,0],[0,0,0,1]]
      const beforeMat = c.transform.worldMatrix.elements;
      expect(beforeMat[0]).to.be.closeTo(4, 1e-5);
      expect(beforeMat[1]).to.be.closeTo(3, 1e-5);
      expect(beforeMat[4]).to.be.closeTo(3, 1e-5);
      expect(beforeMat[5]).to.be.closeTo(4, 1e-5);
      expect(beforeMat[10]).to.be.closeTo(5, 1e-5);
      expect(c.transform.lossyWorldScale.x).to.be.closeTo(4, 1e-5);
      expect(c.transform.lossyWorldScale.y).to.be.closeTo(4, 1e-5);
      expect(c.transform.lossyWorldScale.z).to.be.closeTo(5, 1e-5);

      // Reparent C to identity parent D: Unity-style diagonal scale (4, 4, 5), rebuilt clean TRS matrix
      c.parent = d;

      expect(c.transform.position.x).to.be.closeTo(0, 1e-5);
      expect(c.transform.position.y).to.be.closeTo(0, 1e-5);
      expect(c.transform.position.z).to.be.closeTo(0, 1e-5);
      expect(c.transform.rotation.x).to.be.closeTo(0, 1e-4);
      expect(c.transform.rotation.y).to.be.closeTo(0, 1e-4);
      expect(c.transform.rotation.z).to.be.closeTo(0, 1e-4);
      expect(c.transform.scale.x).to.be.closeTo(4, 1e-5);
      expect(c.transform.scale.y).to.be.closeTo(4, 1e-5);
      expect(c.transform.scale.z).to.be.closeTo(5, 1e-5);
      expect(c.transform.lossyWorldScale.x).to.be.closeTo(4, 1e-5);
      expect(c.transform.lossyWorldScale.y).to.be.closeTo(4, 1e-5);
      expect(c.transform.lossyWorldScale.z).to.be.closeTo(5, 1e-5);

      const expectedClean = new Matrix();
      Matrix.scaling(new Vector3(4, 4, 5), expectedClean);
      for (let i = 0; i < 16; i++) {
        expect(c.transform.localMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
        expect(c.transform.worldMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
      }

      // Clone and subsequent minor translation stay 100% consistent (no state split)
      const cloned = c.clone();
      for (let i = 0; i < 16; i++) {
        expect(cloned.transform.localMatrix.elements[i]).to.be.closeTo(expectedClean.elements[i], 1e-5);
      }
      c.transform.position.x = 1;
      expect(c.transform.worldMatrix.elements[0]).to.be.closeTo(4, 1e-5);
      expect(c.transform.worldMatrix.elements[1]).to.be.closeTo(0, 1e-5);
      expect(c.transform.worldMatrix.elements[5]).to.be.closeTo(4, 1e-5);
      expect(c.transform.worldMatrix.elements[12]).to.be.closeTo(1, 1e-5);

      // Same clean diagonal scale when detaching sheared child directly to null
      const c2 = b.createChild("shearC2");
      c2.transform.setRotation(0, 0, -45);
      c2.parent = null;
      expect(c2.transform.scale.x).to.be.closeTo(4, 1e-5);
      expect(c2.transform.scale.y).to.be.closeTo(4, 1e-5);
      expect(c2.transform.scale.z).to.be.closeTo(5, 1e-5);
      expect(c2.transform.lossyWorldScale.x).to.be.closeTo(4, 1e-5);
      expect(c2.transform.lossyWorldScale.y).to.be.closeTo(4, 1e-5);
      expect(c2.transform.lossyWorldScale.z).to.be.closeTo(5, 1e-5);
      expect(c2.transform.localMatrix.elements[1]).to.be.closeTo(0, 1e-5);

      a.destroy();
      d.destroy();
      cloned.destroy();
      c2.destroy();
    });

    it("handles singular (zero-scale) new parent without producing NaN", () => {
      const parentA = scene.createRootEntity("singularA");
      parentA.transform.setPosition(3, 4, 5);
      const child = parentA.createChild("singularChild");
      child.transform.setPosition(1, 2, 3);
      child.transform.setScale(2, 2, 2);

      const zeroParent = scene.createRootEntity("zeroParent");
      zeroParent.transform.setScale(0, 1, 1);

      child.parent = zeroParent;

      expect(Number.isFinite(child.transform.position.x)).to.equal(true);
      expect(Number.isFinite(child.transform.scale.x)).to.equal(true);
      expect(Number.isFinite(child.transform.rotationQuaternion.w)).to.equal(true);
      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(child.transform.localMatrix.elements[i])).to.equal(true);
      }

      parentA.destroy();
      zeroParent.destroy();
    });
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

class InheritedDependentTransform extends AutoAddDependentTransform {}

class ThrowingReplacementTransform extends Transform {
  constructor(entity: Entity) {
    super(entity);
    throw "transform construction failed";
  }
}

class NestedCloneComponent extends Script {
  static source: Entity;
  static result: Entity;

  reference: CloneTailComponent;

  constructor(entity: Entity) {
    super(entity);
    if (NestedCloneComponent.source) {
      const source = NestedCloneComponent.source;
      NestedCloneComponent.source = null;
      NestedCloneComponent.result = source.clone();
    }
  }
}

class CloneTailComponent extends Script {}

class ThrowingCloneComponent extends Script {
  static throwOnConstruction = false;

  constructor(entity: Entity) {
    super(entity);
    if (ThrowingCloneComponent.throwOnConstruction) {
      throw "clone construction failed";
    }
  }
}
