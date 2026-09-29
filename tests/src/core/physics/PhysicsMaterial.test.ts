import {
  DynamicCollider,
  PhysicsMaterial,
  PhysicsMaterialCombineMode,
  Entity,
  Engine,
  BoxColliderShape,
  CapsuleColliderShape,
  SphereColliderShape,
  MeshColliderShape,
  ModelMesh,
  CharacterController,
  StaticCollider,
  PlaneColliderShape,
  Loader
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { ReflectionParser } from "@galacean/engine-loader";
import {
  ParserContext,
  ParserType
} from "../../../../packages/loader/src/resource-deserialize/resources/parser/ParserContext";
import { createPhysics } from "./PhysicsTestUtils";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";

const runtimeModes = [PhysXRuntimeMode.WebAssembly, PhysXRuntimeMode.WebAssemblySIMD];

describe.each(runtimeModes)("PhysicsMaterial defaults (%s)", (runtimeMode) => {
  it("uses the engine's complete default policy for shared and instance materials", async () => {
    const originalDefaults = PhysicsMaterial._defaultProperties;
    const defaults = {
      staticFriction: 0.2,
      dynamicFriction: 0.4,
      bounciness: 0.8,
      frictionCombine: PhysicsMaterialCombineMode.Minimum,
      bounceCombine: PhysicsMaterialCombineMode.Maximum
    };
    (PhysicsMaterial as any)._defaultProperties = defaults;
    const physics = createPhysics(runtimeMode);
    const originalInit = (physics as any)._init;
    let createMaterial: ReturnType<typeof vi.spyOn>;
    let setFrictionCombine: ReturnType<typeof vi.spyOn>;
    let setBounceCombine: ReturnType<typeof vi.spyOn>;
    const initialize = vi.spyOn(physics as any, "_init").mockImplementation((px) => {
      createMaterial = vi.spyOn(px.PxPhysics.prototype, "createMaterial");
      setFrictionCombine = vi.spyOn(px.PxMaterial.prototype, "setFrictionCombineMode");
      setBounceCombine = vi.spyOn(px.PxMaterial.prototype, "setRestitutionCombineMode");
      originalInit.call(physics, px);
    });
    let engine: Engine;
    let shape: BoxColliderShape;
    let material: PhysicsMaterial;
    try {
      await physics.initialize();
      expect(createMaterial).not.toHaveBeenCalled();
      engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      expect((engine as any)._basicResources.physicsDefaultMaterial).toBeInstanceOf(PhysicsMaterial);
      shape = new BoxColliderShape();
      expect(createMaterial).toHaveBeenCalledExactlyOnceWith(0.2, 0.4, 0.8);
      expect(setFrictionCombine).toHaveBeenCalledExactlyOnceWith(PhysicsMaterialCombineMode.Minimum);
      expect(setBounceCombine).toHaveBeenCalledExactlyOnceWith(PhysicsMaterialCombineMode.Maximum);

      material = shape.getInstanceMaterial();
      for (const key in defaults) {
        expect(material[key]).toBe(defaults[key]);
      }
      expect(createMaterial).toHaveBeenNthCalledWith(2, 0.2, 0.4, 0.8);
      expect(setFrictionCombine).toHaveBeenNthCalledWith(2, PhysicsMaterialCombineMode.Minimum);
      expect(setBounceCombine).toHaveBeenNthCalledWith(2, PhysicsMaterialCombineMode.Maximum);
    } finally {
      shape?._destroy();
      material?.destroy();
      engine?.destroy();
      if (engine) physics.destroy();
      createMaterial?.mockRestore();
      setFrictionCombine?.mockRestore();
      setBounceCombine?.mockRestore();
      initialize.mockRestore();
      (PhysicsMaterial as any)._defaultProperties = originalDefaults;
    }
  });
});

describe.each(runtimeModes)("PhysicsMaterial (%s)", (runtimeMode) => {
  let rootEntity: Entity;
  let engine: Engine;
  let physics: ReturnType<typeof createPhysics>;

  function addPlane(x: number, y: number, z: number) {
    const planeEntity = rootEntity.createChild("PlaneEntity");
    planeEntity.transform.setPosition(x, y, z);
    planeEntity.transform.setScale(20, 1, 20);

    const physicsPlane = new PlaneColliderShape();
    physicsPlane.getInstanceMaterial().dynamicFriction = 0;
    physicsPlane.getInstanceMaterial().staticFriction = 0;
    physicsPlane.getInstanceMaterial().bounciness = 0;
    const planeCollider = planeEntity.addComponent(StaticCollider);
    planeCollider.addShape(physicsPlane);
    return planeEntity;
  }

  function addBox(cubeSize: Vector3, type: typeof DynamicCollider | typeof StaticCollider, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = new BoxColliderShape();
    physicsBox.getInstanceMaterial().dynamicFriction = 0;
    physicsBox.getInstanceMaterial().staticFriction = 0;
    physicsBox.size = cubeSize;
    const boxCollider = boxEntity.addComponent(type);
    boxCollider.addShape(physicsBox);
    return boxEntity;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  beforeAll(async () => {
    physics = createPhysics(runtimeMode);
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(function () {
    while (rootEntity.children.length) {
      rootEntity.children[0].destroy();
    }
  });

  afterAll(() => {
    const defaultMaterial = (engine as any)._basicResources.physicsDefaultMaterial as PhysicsMaterial;
    const release = vi.spyOn((defaultMaterial._nativeMaterial as any)._pxMaterial, "release");
    try {
      engine.destroy();
      expect(release).toHaveBeenCalledTimes(1);
      physics.destroy();
      expect(release).toHaveBeenCalledTimes(1);
    } finally {
      release.mockRestore();
    }
  });

  it("passes the shared default to the backend without allocating materials for new or cloned shapes", () => {
    const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
    const factories = [
      ["createBoxColliderShape", 2],
      ["createSphereColliderShape", 2],
      ["createCapsuleColliderShape", 3],
      ["createPlaneColliderShape", 1],
      ["createMeshColliderShape", 4]
    ] as const;
    const createShapes = factories.map(([method, materialIndex]) => ({
      spy: vi.spyOn(physics, method),
      materialIndex
    }));
    const source = rootEntity.createChild("defaultMaterials");
    const collider = source.addComponent(StaticCollider);
    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
    mesh.setIndices(new Uint16Array([0, 2, 1]));
    const meshShape = new MeshColliderShape();
    meshShape.mesh = mesh;
    const shapes = [
      new BoxColliderShape(),
      new SphereColliderShape(),
      new CapsuleColliderShape(),
      new PlaneColliderShape(),
      meshShape
    ];
    let clone: Entity;
    try {
      for (const shape of shapes) {
        collider.addShape(shape);
      }
      clone = source.clone();
      for (const shape of [...shapes, ...clone.getComponent(StaticCollider).shapes]) {
        expect(shape.material).toBeNull();
        expect((shape._nativeShape as any)._pxMaterial).toBe(
          (engine as any)._basicResources.physicsDefaultMaterial._nativeMaterial._pxMaterial
        );
      }
      for (const { spy, materialIndex } of createShapes) {
        expect(spy).toHaveBeenCalled();
        for (const args of spy.mock.calls) {
          expect(args[materialIndex]).toBe((engine as any)._basicResources.physicsDefaultMaterial._nativeMaterial);
        }
      }
      expect(createMaterial).not.toHaveBeenCalled();
    } finally {
      for (const { spy } of createShapes) {
        spy.mockRestore();
      }
      createMaterial.mockRestore();
      clone?.destroy();
      source.destroy();
      mesh.destroy();
    }
  });

  it.each([BoxColliderShape, SphereColliderShape, CapsuleColliderShape, PlaneColliderShape, MeshColliderShape])(
    "instantiates the default only through getInstanceMaterial for %s",
    (Shape) => {
      const shape = new Shape();
      const other = new Shape();
      const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
      let material: PhysicsMaterial;
      try {
        expect(shape.material).toBeNull();
        expect(other.material).toBeNull();
        expect(createMaterial).not.toHaveBeenCalled();
        material = shape.getInstanceMaterial();
        expect(shape.material).toBe(material);
        expect(shape.getInstanceMaterial()).toBe(material);
        expect(createMaterial).toHaveBeenCalledTimes(1);
        expect(material.staticFriction).toBe(0.6);
        expect(material.dynamicFriction).toBe(0.6);
        expect(material.bounciness).toBe(0);
        material.bounciness = 1;
        expect(other.material).toBeNull();
        if (shape._nativeShape) {
          expect((shape._nativeShape as any)._pxMaterial).toBe((material._nativeMaterial as any)._pxMaterial);
          expect((other._nativeShape as any)._pxMaterial).toBe(
            (engine as any)._basicResources.physicsDefaultMaterial._nativeMaterial._pxMaterial
          );
        }
        shape.material = null;
        expect(shape.material).toBeNull();
        expect(createMaterial).toHaveBeenCalledTimes(1);
        if (shape._nativeShape) {
          expect((shape._nativeShape as any)._pxMaterial).toBe(
            (engine as any)._basicResources.physicsDefaultMaterial._nativeMaterial._pxMaterial
          );
        }
        const nextMaterial = shape.getInstanceMaterial();
        expect(nextMaterial).not.toBe(material);
        expect(nextMaterial.bounciness).toBe(0);
        expect(createMaterial).toHaveBeenCalledTimes(2);
      } finally {
        createMaterial.mockRestore();
        shape._destroy();
        other._destroy();
        material?.destroy();
        shape.material?.destroy();
      }
    }
  );

  it("shares assigned materials and clones all properties only for an explicit instance", () => {
    const shape = new BoxColliderShape();
    const other = new BoxColliderShape();
    const shared = new PhysicsMaterial();
    shared.staticFriction = 0.2;
    shared.dynamicFriction = 0.4;
    shared.bounciness = 0.8;
    shared.frictionCombine = PhysicsMaterialCombineMode.Minimum;
    shared.bounceCombine = PhysicsMaterialCombineMode.Maximum;
    const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
    let instance: PhysicsMaterial;
    let replacement: PhysicsMaterial;
    try {
      shape.material = shared;
      other.material = shared;
      expect(shape.material).toBe(shared);
      expect(other.material).toBe(shared);
      shape.material.dynamicFriction = 0.3;
      expect(other.material.dynamicFriction).toBe(0.3);
      expect(createMaterial).not.toHaveBeenCalled();

      instance = shape.getInstanceMaterial();
      expect(instance).not.toBe(shared);
      expect(shape.material).toBe(instance);
      expect(other.material).toBe(shared);
      for (const key of Object.keys(PhysicsMaterial._defaultProperties)) {
        expect(instance[key]).toBe(shared[key]);
      }
      expect((shape._nativeShape as any)._pxMaterial).toBe((instance._nativeMaterial as any)._pxMaterial);
      instance.dynamicFriction = 0.9;
      expect(shared.dynamicFriction).toBe(0.3);
      shape.material = instance;
      expect(shape.getInstanceMaterial()).toBe(instance);
      expect(createMaterial).toHaveBeenCalledTimes(1);

      shape.material = shared;
      expect(shape.material).toBe(shared);
      replacement = shape.getInstanceMaterial();
      expect(replacement).not.toBe(instance);
      expect(replacement).not.toBe(shared);
      expect(replacement.dynamicFriction).toBe(0.3);
      expect(createMaterial).toHaveBeenCalledTimes(2);
    } finally {
      createMaterial.mockRestore();
      shape._destroy();
      other._destroy();
      shared.destroy();
      instance?.destroy();
      replacement?.destroy();
    }
  });

  it("creates independent instances from untouched clone defaults", () => {
    const source = rootEntity.createChild("defaultSource");
    const collider = source.addComponent(StaticCollider);
    const shape = new BoxColliderShape();
    collider.addShape(shape);
    const clone = source.clone();
    const cloneShape = clone.getComponent(StaticCollider).shapes[0];
    const material = shape.getInstanceMaterial();
    const cloneMaterial = cloneShape.getInstanceMaterial();
    try {
      material.dynamicFriction = 0;
      expect(cloneMaterial).not.toBe(material);
      expect(cloneMaterial.dynamicFriction).toBe(0.6);
    } finally {
      clone.destroy();
      source.destroy();
      material.destroy();
      cloneMaterial.destroy();
    }
  });

  it("preserves default and assigned materials when a mesh is recooked", () => {
    const entity = rootEntity.createChild("meshMaterial");
    const collider = entity.addComponent(StaticCollider);
    const shape = new MeshColliderShape();
    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]);
    mesh.setIndices(new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]));
    shape.mesh = mesh;
    collider.addShape(shape);
    const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
    let material: PhysicsMaterial;
    try {
      shape.isConvex = true;
      expect((shape._nativeShape as any)._pxMaterial).toBe(
        (engine as any)._basicResources.physicsDefaultMaterial._nativeMaterial._pxMaterial
      );
      expect(createMaterial).not.toHaveBeenCalled();
      material = shape.getInstanceMaterial();
      material.bounciness = 0.8;
      shape.isConvex = false;
      expect((shape._nativeShape as any)._pxMaterial).toBe((material._nativeMaterial as any)._pxMaterial);
      expect(createMaterial).toHaveBeenCalledTimes(1);
    } finally {
      createMaterial.mockRestore();
      entity.destroy();
      material?.destroy();
      mesh.destroy();
    }
  });

  it.each([false, true])("loads a shared material without allocating a default (nested: %s)", async (nested) => {
    const shape = new BoxColliderShape();
    const material = new PhysicsMaterial();
    const context = new ParserContext(engine, ParserType.Scene, engine.sceneManager.activeScene);
    const parser = new ReflectionParser(context, [{ url: "physics-material" }]);
    const resolveMaterial = vi.spyOn(engine.resourceManager as any, "getResourceByRef").mockResolvedValue(material);
    const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
    try {
      const props = { material: { $ref: 0 } };
      await parser.parseProps(nested ? { shape } : shape, nested ? { shape: props } : props);
      expect(shape.material).toBe(material);
      expect(createMaterial).not.toHaveBeenCalled();
      await parser.parseProps(shape, { material: { bounciness: 0.7 } });
      expect(shape.material).toBe(material);
      expect(material.bounciness).toBe(0.7);
    } finally {
      resolveMaterial.mockRestore();
      createMaterial.mockRestore();
      shape._destroy();
      material.destroy();
    }
  });

  it("loads an explicitly constructed material and resets it to the shared default", async () => {
    Loader.registerClass("PhysicsMaterial", PhysicsMaterial);
    const shape = new BoxColliderShape();
    const context = new ParserContext(engine, ParserType.Scene, engine.sceneManager.activeScene);
    const parser = new ReflectionParser(context, []);
    const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
    let material: PhysicsMaterial;
    try {
      await parser.parseProps(shape, { material: { $type: "PhysicsMaterial", bounciness: 0.7 } });
      material = shape.material;
      expect(material).toBeInstanceOf(PhysicsMaterial);
      expect(material.bounciness).toBe(0.7);
      expect(createMaterial).toHaveBeenCalledTimes(1);
      await parser.parseProps(shape, { material: null });
      expect(shape.material).toBeNull();
      expect((shape._nativeShape as any)._pxMaterial).toBe(
        (engine as any)._basicResources.physicsDefaultMaterial._nativeMaterial._pxMaterial
      );
      expect(createMaterial).toHaveBeenCalledTimes(1);
    } finally {
      createMaterial.mockRestore();
      shape._destroy();
      material?.destroy();
    }
  });

  it.each([false, true])(
    "updates active controllers when instancing or resetting material (assigned: %s)",
    (assigned) => {
      const entity = rootEntity.createChild("materialController");
      entity.transform.setPosition(100, 100, 0);
      const controller = entity.addComponent(CharacterController);
      const shape = new BoxColliderShape();
      const shared = new PhysicsMaterial();
      if (assigned) shape.material = shared;
      controller.addShape(shape);
      const dropProbe = () => {
        const probe = rootEntity.createChild("materialProbe");
        probe.transform.setPosition(100, 104, 0);
        probe.addComponent(DynamicCollider).addShape(new SphereColliderShape());
        for (let i = 0; i < 90; i++) {
          engine.sceneManager.activeScene.physics._update(1 / 60);
        }
        const height = probe.transform.position.y;
        probe.destroy();
        return height;
      };

      const defaultRestingHeight = dropProbe();
      const material = shape.getInstanceMaterial();
      material.bounciness = 1;
      material.bounceCombine = PhysicsMaterialCombineMode.Maximum;
      const replacement = new PhysicsMaterial();
      try {
        expect(dropProbe()).toBeGreaterThan(defaultRestingHeight + 1);
        controller.enabled = false;
        controller.enabled = true;
        expect(dropProbe()).toBeGreaterThan(defaultRestingHeight + 1);
        expect(shared.bounciness).toBe(0);
        shape.material = replacement;
        expect(dropProbe()).toBeCloseTo(defaultRestingHeight, 4);
        shape.material = material;
        expect(dropProbe()).toBeGreaterThan(defaultRestingHeight + 1);
        shape.material = null;
        expect(shape.material).toBeNull();
        expect(dropProbe()).toBeCloseTo(defaultRestingHeight, 4);
        controller.enabled = false;
        controller.enabled = true;
        expect(dropProbe()).toBeCloseTo(defaultRestingHeight, 4);
      } finally {
        entity.destroy();
        material.destroy();
        replacement.destroy();
        shared.destroy();
      }
    }
  );

  it("bounciness", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(3, 5, 0));
    const ground = addPlane(0, -0.5, 0);

    const collider = boxEntity.getComponent(DynamicCollider);
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;

    collider.shapes[0].getInstanceMaterial().bounciness = 1;
    collider2.shapes[0].getInstanceMaterial().bounciness = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(boxEntity.transform.position.y).greaterThan(0);
    expect(formatValue(boxEntity2.transform.position.y)).eq(0);
  });

  it.each([false, true])(
    "clones share material references but reset instance ownership (instanced: %s)",
    (instanced) => {
      const sourceEntity = rootEntity.createChild("materialClone");
      const sourceShape = new BoxColliderShape();
      sourceEntity.addComponent(StaticCollider).addShape(sourceShape);
      const sourceMaterial = instanced ? sourceShape.getInstanceMaterial() : new PhysicsMaterial();
      sourceShape.material = sourceMaterial;
      sourceMaterial.bounciness = 0.7;
      const destroySpy = vi.spyOn(PhysicsMaterial.prototype, "destroy");
      const createMaterial = vi.spyOn(physics._pxPhysics, "createMaterial");
      const cloneEntity = sourceEntity.clone();
      const cloneShape = cloneEntity.getComponent(StaticCollider).shapes[0];
      let cloneMaterial: PhysicsMaterial;
      try {
        expect(cloneShape.material).toBe(sourceMaterial);
        expect(createMaterial).not.toHaveBeenCalled();
        expect(destroySpy).not.toHaveBeenCalled();
        cloneMaterial = cloneShape.getInstanceMaterial();
        expect(cloneMaterial).not.toBe(sourceMaterial);
        expect(cloneMaterial.bounciness).toBe(0.7);
        expect(cloneShape.getInstanceMaterial()).toBe(cloneMaterial);
        expect(createMaterial).toHaveBeenCalledTimes(1);
        cloneMaterial.bounciness = 0;
        expect(sourceShape.material.bounciness).toBe(0.7);
        if (instanced) expect(sourceShape.getInstanceMaterial()).toBe(sourceMaterial);
      } finally {
        destroySpy.mockRestore();
        createMaterial.mockRestore();
        cloneEntity.destroy();
        sourceEntity.destroy();
        sourceMaterial.destroy();
        cloneMaterial?.destroy();
      }
    }
  );

  it("bounceCombine Average", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;

    collider.shapes[0].getInstanceMaterial().bounciness = 1;
    collider.shapes[0].getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Average;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0.1775);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    collider2.automaticCenterOfMass = true;
    collider2.automaticInertiaTensor = true;
    collider2.shapes[0].getInstanceMaterial().bounciness = 0.5;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().bounciness = 0.5;
    collider2.shapes[0].getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Average;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity2.transform.position.y)).eq(0.1775);
  });

  it("bounceCombine Minimum", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.shapes[0].getInstanceMaterial().bounciness = 1;
    collider.shapes[0].getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Minimum;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().bounciness = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0);
  });

  it("bounceCombine Maximum", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.shapes[0].getInstanceMaterial().bounciness = 0;
    collider.shapes[0].getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Maximum;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().bounciness = 1;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(boxEntity.transform.position.y).toBeCloseTo(5.16451, 4);
  });

  it("bounceCombine Multiply", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.shapes[0].getInstanceMaterial().bounciness = 1;
    collider.shapes[0].getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Multiply;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().bounciness = 0.5;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0.1775);
  });

  it("dynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider2.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().dynamicFriction = 1;
    collider2.shapes[0].getInstanceMaterial().dynamicFriction = 0.5;

    collider.applyForce(new Vector3(0, 0, 1000));
    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).greaterThan(boxEntity.transform.position.z);
    expect(collider2.linearVelocity.z).greaterThan(collider.linearVelocity.z);
  });

  it("staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider2.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().staticFriction = 2000;
    collider2.shapes[0].getInstanceMaterial().staticFriction = 100;

    collider.applyForce(new Vector3(0, 0, 1000));
    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
    expect(boxEntity2.transform.position.z).not.closeTo(0, 0.001);
    expect(boxEntity2.transform.position.z).greaterThan(boxEntity.transform.position.z);
  });

  it("frictionCombine Average staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Average;

    collider.shapes[0].getInstanceMaterial().staticFriction = 2000;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    collider.shapes[0].getInstanceMaterial().staticFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 2000;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Minimum staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider.shapes[0].getInstanceMaterial().staticFriction = 2000;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).greaterThan(10);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider2.shapes[0].getInstanceMaterial().staticFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 2000;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).greaterThan(10);
  });

  it("frictionCombine Maximum staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider.shapes[0].getInstanceMaterial().staticFriction = 2000;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider2.shapes[0].getInstanceMaterial().staticFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 2000;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Multiply staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider.shapes[0].getInstanceMaterial().staticFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 200;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider2.shapes[0].getInstanceMaterial().staticFriction = 100;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 20;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Average DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Average;

    collider.shapes[0].getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(1.27903);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Average;

    collider2.shapes[0].getInstanceMaterial().dynamicFriction = 5;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 5;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(1.27903);
  });

  it("frictionCombine Minimum DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider.shapes[0].getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(16.66667);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider2.shapes[0].getInstanceMaterial().dynamicFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 10;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(16.66667);
  });

  it("frictionCombine Maximum DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider.shapes[0].getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(0.57139);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider2.shapes[0].getInstanceMaterial().dynamicFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 10;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(0.57139);
  });

  it("frictionCombine Multiply DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider.shapes[0].getInstanceMaterial().dynamicFriction = 2;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 5;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(0.57139);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].getInstanceMaterial().frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider2.shapes[0].getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].getInstanceMaterial().dynamicFriction = 1;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(0.57139);
  });

  it("destroy", () => {
    const physicsMaterial = new PhysicsMaterial();
    physicsMaterial.destroy();
    expect(() => {
      physicsMaterial.bounciness = 1;
    }).toThrowError();
  });
});
