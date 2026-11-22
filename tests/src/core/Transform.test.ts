import {
  deepClone,
  dependentComponents,
  DependentMode,
  Entity,
  ICloneHook,
  MeshRenderer,
  Scene,
  Script,
  Transform,
  TransformModifyFlags
} from "@galacean/engine-core";
import { Matrix, Matrix3x3, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it, vi } from "vitest";

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

  it("updates child world scale after a parent position and scale edit following a child read", () => {
    const parent = scene.createRootEntity("scale parent");
    const child = parent.createChild("scale child");
    // Reading only the child also cleans ancestor WorldScale so later propagation cannot prune
    expect(child.transform.lossyWorldScale.x).to.equal(1);

    parent.transform.position.set(4, 0, 0);
    parent.transform.setScale(2, 1, 1);
    expect(child.transform.lossyWorldScale.x).to.equal(2);
    expect(child.transform.worldPosition.x).to.equal(4);
    parent.destroy();
  });

  it("updates child world scale after a parent rotation and scale edit following a child read", () => {
    const parent = scene.createRootEntity("rotated scale parent");
    parent.transform.setScale(2, 2, 2);
    const child = parent.createChild("rotated scale child");
    expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(2, 2, 2));

    // A uniformly scaled parent rotation does not notify children of a scale change
    parent.transform.setRotation(0, 90, 0);
    parent.transform.setScale(3, 3, 3);
    const scale = child.transform.lossyWorldScale;
    expect(scale.x).to.be.closeTo(3, 1e-6);
    expect(scale.y).to.be.closeTo(3, 1e-6);
    expect(scale.z).to.be.closeTo(3, 1e-6);
    parent.destroy();
  });

  it("uses uniform ancestor fast path recursively and falls back to matrix scale decomposition when non-uniform", () => {
    const grandparent = scene.createRootEntity("grandparent");
    const parent = grandparent.createChild("parent");
    const child = parent.createChild("child");
    const scaleMatMultiplySpy = vi.spyOn(Matrix3x3, "multiply");
    try {
      // Uniform ancestors with negative scale and arbitrary rotations take the exact scalar-multiply fast path
      grandparent.transform.setScale(2, 2, 2);
      parent.transform.setScale(-1, -1, -1);
      parent.transform.setRotation(0, 90, 0);
      child.transform.setScale(1, 3, 5);
      child.transform.setRotation(45, 0, 0);
      expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(-2, -6, -10));
      expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(0);

      // Non-uniform ancestor after a position edit must still notify and fall back to matrix scale decomposition
      grandparent.transform.setScale(1, 2, 3);
      parent.transform.setScale(1, 1, 1);
      parent.transform.setRotation(0, 0, 0);
      child.transform.setScale(4, 5, 6);
      child.transform.setRotation(90, 0, 0);
      expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(4, 15, 12));
      // Unrotated parent uses exact scalar multiplication; rotated child still falls back to matrix decomposition.
      expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(1);

      parent.transform.setPosition(4, 0, 0);
      grandparent.transform.setScale(2, 2, 3);
      const afterNonUniform = child.transform.lossyWorldScale;
      expect(afterNonUniform.x).to.be.closeTo(8, 1e-6);
      expect(afterNonUniform.y).to.be.closeTo(15, 1e-6);
      expect(afterNonUniform.z).to.be.closeTo(12, 1e-6);

      // Establish a clean uniform baseline before testing set localMatrix after position + uniform rotation
      grandparent.transform.setScale(2, 2, 2);
      expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(8, 10, 12));

      parent.transform.setPosition(1, 2, 3);
      parent.transform.setRotation(0, 90, 0);
      const matrix = new Matrix();
      Matrix.affineTransformation(new Vector3(5, 5, 5), new Quaternion(), new Vector3(1, 2, 3), matrix);
      parent.transform.localMatrix = matrix;
      expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(40, 50, 60));
    } finally {
      scaleMatMultiplySpy.mockRestore();
      grandparent.destroy();
    }
  });

  it("uses matrix scale decomposition for authored sheared localMatrix and restores TRS after edits", () => {
    const parent = scene.createRootEntity();
    const child = parent.createChild();
    try {
      const matrix = new Matrix();
      matrix.elements[1] = matrix.elements[4] = 0.0625;
      matrix.elements[10] = Math.hypot(1, 0.0625);
      parent.transform.localMatrix = matrix;

      expect(parent.transform.lossyWorldScale.x).toBeCloseTo(1, 5);
      expect(child.transform.lossyWorldScale.x).toBeCloseTo(1, 5);

      parent.transform.setScale(2, 3, 4);
      expect(parent.transform.lossyWorldScale).toEqual(new Vector3(2, 3, 4));
      expect(child.transform.lossyWorldScale).toEqual(new Vector3(2, 3, 4));
    } finally {
      parent.destroy();
    }
  });

  it("uses matrix scale decomposition for Transform subclasses overriding matrix or scale accessors", () => {
    class MatrixScalingTransform extends Transform {
      private readonly _matrix = new Matrix();

      constructor(entity: Entity) {
        super(entity);
        this._matrix.elements[0] = 2;
      }

      override get localMatrix(): Matrix {
        return this._matrix;
      }
    }

    class CustomScaleTransform extends Transform {
      private readonly _customScale = new Vector3(9, 9, 9);

      override get lossyWorldScale(): Vector3 {
        return this._customScale;
      }
    }

    const root = scene.createRootEntity();
    const child = root.createChild();
    const grandchild = child.createChild();
    const custom = child.addComponent(MatrixScalingTransform);
    const scaleRoot = scene.createRootEntity();
    const scaleChild = scaleRoot.createChild();
    scaleRoot.addComponent(CustomScaleTransform);
    try {
      root.transform.setScale(3, 3, 3);
      expect(custom.worldMatrix.elements[0]).toBe(6);
      expect(custom.lossyWorldScale).toEqual(new Vector3(6, 3, 3));

      const transform = grandchild.transform;
      expect(transform.lossyWorldScale).toEqual(new Vector3(6, 3, 3));
      transform.setRotation(0, 0, 90);
      expect(transform.lossyWorldScale.x).toBeCloseTo(3, 5);
      expect(transform.lossyWorldScale.y).toBeCloseTo(6, 5);

      scene.addRootEntity(child);
      expect(custom.worldMatrix.elements[0]).toBe(2);
      expect(custom.lossyWorldScale).toEqual(new Vector3(2, 1, 1));
      expect(transform.lossyWorldScale.x).toBeCloseTo(1, 5);
      expect(transform.lossyWorldScale.y).toBeCloseTo(2, 5);

      expect(scaleChild.transform.lossyWorldScale).toEqual(new Vector3(1, 1, 1));
    } finally {
      child.destroy();
      root.destroy();
      scaleRoot.destroy();
    }
  });

  it("keeps unrotated child lossyWorldScale exact without matrix decomposition while a non-uniform parent rotates", () => {
    const parent = scene.createRootEntity("non-uniform-parent");
    const child = parent.createChild("unrotated-child");
    const grandchild = child.createChild("unrotated-grandchild");
    const scaleMatMultiplySpy = vi.spyOn(Matrix3x3, "multiply");
    try {
      parent.transform.setScale(2, 3, 2);
      grandchild.transform.setScale(2, 0.5, 4);

      for (let step = 1; step <= 90; step++) {
        parent.transform.setRotation(0, step * 3.7, 0);
        expect(child.transform.lossyWorldScale).toEqual(new Vector3(2, 3, 2));
        expect(grandchild.transform.lossyWorldScale).toEqual(new Vector3(4, 1.5, 8));
      }
      expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(0);

      child.transform.setRotation(0, 0, 90);
      expect(child.transform.lossyWorldScale).toEqual(new Vector3(3, 2, 2));
      expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(1);

      scaleMatMultiplySpy.mockClear();
      child.transform.setRotationQuaternion(0, 0, 0, -1);
      parent.transform.setRotation(0, 37, 0);
      expect(child.transform.lossyWorldScale).toEqual(new Vector3(2, 3, 2));
      expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(0);

      child.transform.setRotation(0, 0, 0);
      parent.transform.setRotation(0, 74, 0);
      expect(child.transform.lossyWorldScale).toEqual(new Vector3(2, 3, 2));
      expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(0);

      // Unrotated child under a sheared parent still matches its matrix scale without extra multiplication.
      const shearGrandparent = scene.createRootEntity("shear-grandparent");
      const shearParent = shearGrandparent.createChild("shear-parent");
      const shearChild = shearParent.createChild("shear-child");
      try {
        shearGrandparent.transform.setScale(2, 1, 1);
        shearParent.transform.setRotation(0, 0, 45);
        shearChild.transform.setScale(2, 3, 4);
        const parentScale = shearParent.transform.lossyWorldScale.clone();
        scaleMatMultiplySpy.mockClear();
        const childScale = shearChild.transform.lossyWorldScale;
        expect(scaleMatMultiplySpy).toHaveBeenCalledTimes(0);
        expect(childScale.x).toBeCloseTo(parentScale.x * 2, 6);
        expect(childScale.y).toBeCloseTo(parentScale.y * 3, 6);
        expect(childScale.z).toBeCloseTo(parentScale.z * 4, 6);
      } finally {
        shearGrandparent.destroy();
      }
    } finally {
      scaleMatMultiplySpy.mockRestore();
      parent.destroy();
    }
  });

  it("reports internal TRS, world-pose override, and world uniform scaling flags accurately", () => {
    class CustomWorldPositionTransform extends Transform {
      override get worldPosition(): Vector3 {
        return super.worldPosition;
      }
    }

    class CustomLossyScaleTransform extends Transform {
      override get lossyWorldScale(): Vector3 {
        return super.lossyWorldScale;
      }
    }

    class CustomWorldMatrixTransform extends Transform {
      override get worldMatrix(): Matrix {
        return super.worldMatrix;
      }
    }

    const parent = scene.createRootEntity("flags-parent");
    const child = parent.createChild("flags-child");
    const posEntity = scene.createRootEntity("custom-pos");
    const scaleEntity = scene.createRootEntity("custom-scale");
    const matrixEntity = scene.createRootEntity("custom-matrix");
    try {
      const parentTransform = parent.transform;
      const childTransform = child.transform;
      expect(childTransform._usesTRSMatrix).toBe(true);
      expect(childTransform._hasCustomWorldPose).toBe(false);
      expect(childTransform._getWorldUniformScaling()).toBe(true);

      parentTransform.setScale(2, 1, 1);
      expect(childTransform._getWorldUniformScaling()).toBe(false);

      parentTransform.localMatrix = new Matrix();
      expect(parentTransform._usesTRSMatrix).toBe(false);
      expect(parentTransform._getWorldUniformScaling()).toBe(false);

      parentTransform.setScale(2, 2, 2);
      expect(parentTransform._usesTRSMatrix).toBe(true);
      expect(parentTransform._getWorldUniformScaling()).toBe(true);
      expect(childTransform._getWorldUniformScaling()).toBe(true);

      const posTransform = posEntity.addComponent(CustomWorldPositionTransform);
      expect(posTransform._usesTRSMatrix).toBe(true);
      expect(posTransform._hasCustomWorldPose).toBe(true);

      const scaleTransform = scaleEntity.addComponent(CustomLossyScaleTransform);
      expect(scaleTransform._usesTRSMatrix).toBe(false);
      expect(scaleTransform._hasCustomWorldPose).toBe(false);

      const matrixTransform = matrixEntity.addComponent(CustomWorldMatrixTransform);
      expect(matrixTransform._usesTRSMatrix).toBe(false);
      expect(matrixTransform._hasCustomWorldPose).toBe(true);
    } finally {
      parent.destroy();
      posEntity.destroy();
      scaleEntity.destroy();
      matrixEntity.destroy();
    }
  });

  it("preserves WorldScale listener fidelity across position, uniform rotation, and scale changes", () => {
    const parent = scene.createRootEntity("listener scale parent");
    const child = parent.createChild("listener scale child");
    const childFlags: number[] = [];
    // @ts-ignore
    child._updateFlagManager.addListener((type?: number) => {
      if (typeof type === "number") childFlags.push(type);
    });

    expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(1, 1, 1));
    childFlags.length = 0;

    // Position and uniform rotation must not dirty or dispatch WorldScale
    parent.transform.setPosition(4, 0, 0);
    parent.transform.setRotation(0, 90, 0);
    expect(childFlags.some((flag) => (flag & TransformModifyFlags.WorldScale) !== 0)).to.equal(false);

    parent.transform.setScale(2, 1, 1);
    expect(childFlags.some((flag) => (flag & TransformModifyFlags.WorldScale) !== 0)).to.equal(true);
    expect(child.transform.lossyWorldScale).to.deep.equal(new Vector3(2, 1, 1));

    parent.destroy();
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
    // A component that reads its (world) transform inside `_onClone` — e.g., a physics
    // component reading `lossyWorldScale` / `worldMatrix` when initialized or cloned.
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
