import { createPhysics } from "../../utils/physics";
import {
  Rigidbody,
  PhysicsMaterial,
  PhysicsMaterialCombineMode,
  Entity,
  Engine,
  BoxCollider,
  CapsuleCollider,
  SphereCollider,
  MeshCollider,
  ModelMesh,
  CharacterController,
  CharacterControllerGeometry,
  PlaneCollider,
  Loader
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { ReflectionParser } from "@galacean/engine-loader";
import {
  ParserContext,
  ParserType
} from "../../../../packages/loader/src/resource-deserialize/resources/parser/ParserContext";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, beforeEach, afterEach, afterAll, expect, it, vi } from "vitest";

const defaults = {
  staticFriction: 0.6,
  dynamicFriction: 0.6,
  bounciness: 0,
  frictionCombine: PhysicsMaterialCombineMode.Average,
  bounceCombine: PhysicsMaterialCombineMode.Average
};
const colliderTypes = [BoxCollider, SphereCollider, CapsuleCollider, PlaneCollider, MeshCollider];

it("uses the complete default policy for shared and instance materials", async () => {
  const physics = createPhysics();
  const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
  let engine: Engine;
  try {
    await physics.initialize();
    expect(createMaterial).not.toHaveBeenCalled();
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    expect(createMaterial).toHaveBeenCalledExactlyOnceWith(defaults);
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial).length).toBe(0);
    const collider = engine.sceneManager.activeScene.createRootEntity().addComponent(BoxCollider);
    expect(collider.material).toBeNull();
    const material = collider.getInstanceMaterial();
    expect(material.engine).toBe(engine);
    for (const key of Object.keys(defaults)) expect(material[key]).toBe(defaults[key]);
    expect(createMaterial).toHaveBeenNthCalledWith(2, defaults);
    const resources = engine.resourceManager.findResourcesByType(PhysicsMaterial);
    expect(resources.length).toBe(1);
    expect(resources[0]).toBe(material);
  } finally {
    engine?.destroy();
    physics.destroy();
    vi.restoreAllMocks();
  }
});

describe("PhysicsMaterial", () => {
  let rootEntity: Entity;
  let engine: Engine;
  let physics: ReturnType<typeof createPhysics>;

  function addPlane(x: number, y: number, z: number) {
    const entity = rootEntity.createChild("PlaneEntity");
    entity.transform.setPosition(x, y, z);
    const collider = entity.addComponent(PlaneCollider);
    const material = collider.getInstanceMaterial();
    material.dynamicFriction = 0;
    material.staticFriction = 0;
    material.bounciness = 0;
    return entity;
  }

  function addBox(size: Vector3, position: Vector3) {
    const entity = rootEntity.createChild("BoxEntity");
    entity.transform.position = position;
    const collider = entity.addComponent(BoxCollider);
    collider.size = size;
    const material = collider.getInstanceMaterial();
    material.dynamicFriction = 0;
    material.staticFriction = 0;
    entity.addComponent(Rigidbody);
    return entity;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  function sync(): void {
    engine.sceneManager.activeScene.physics.overlapSphereAll(new Vector3(10000, 0, 0), 0.1);
  }

  beforeAll(async () => {
    physics = createPhysics();
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(() => {
    while (rootEntity.children.length) rootEntity.children[0].destroy();
    engine.resourceManager.gc();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => {
    engine.destroy();
    physics.destroy();
  });

  it("passes one shared default to the backend without allocating materials for new or cloned Colliders", () => {
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const factories = [
      ["createBoxColliderShape", 2],
      ["createSphereColliderShape", 2],
      ["createCapsuleColliderShape", 3],
      ["createPlaneColliderShape", 1],
      ["createMeshColliderShape", 4]
    ] as const;
    const createColliders = factories.map(([method, materialIndex]) => ({
      spy: vi.spyOn(physics, method),
      materialIndex
    }));
    const source = rootEntity.createChild("defaultMaterials");
    for (const Type of colliderTypes) source.addComponent(Type);
    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
    mesh.setIndices(new Uint16Array([0, 2, 1]));
    source.getComponent(MeshCollider).mesh = mesh;
    const clone = source.clone();
    rootEntity.addChild(clone);
    sync();
    const sharedDefault = createColliders[0].spy.mock.calls[0][2];
    for (const Type of colliderTypes) {
      expect(source.getComponent(Type).material).toBeNull();
      expect(clone.getComponent(Type).material).toBeNull();
    }
    for (const { spy, materialIndex } of createColliders) {
      expect(spy).toHaveBeenCalledTimes(2);
      for (const args of spy.mock.calls) expect(args[materialIndex]).toBe(sharedDefault);
    }
    expect(createMaterial).not.toHaveBeenCalled();
  });

  it.each(colliderTypes)("creates default instances and restores defaults without extra allocations for %s", (Type) => {
    const collider = rootEntity.createChild().addComponent(Type);
    const other = rootEntity.createChild().addComponent(Type);
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    expect(collider.material).toBeNull();
    expect(other.material).toBeNull();
    const material = collider.getInstanceMaterial();
    expect(collider.material).toBe(material);
    expect(collider.getInstanceMaterial()).toBe(material);
    expect(createMaterial).toHaveBeenCalledTimes(1);
    for (const key of Object.keys(defaults)) expect(material[key]).toBe(defaults[key]);
    material.bounciness = 1;
    expect(other.material).toBeNull();
    collider.material = null;
    expect(collider.material).toBeNull();
    expect(material.refCount).toBe(0);
    expect(material.destroyed).toBe(false);
    expect(createMaterial).toHaveBeenCalledTimes(1);
    const next = collider.getInstanceMaterial();
    expect(next).not.toBe(material);
    expect(next.bounciness).toBe(0);
    expect(createMaterial).toHaveBeenCalledTimes(2);
  });

  it("shares assigned materials and clones all properties only for an explicit instance", () => {
    const collider = rootEntity.createChild().addComponent(BoxCollider);
    const other = rootEntity.createChild().addComponent(BoxCollider);
    const shared = new PhysicsMaterial(engine);
    shared.staticFriction = 0.2;
    shared.dynamicFriction = 0.4;
    shared.bounciness = 0.8;
    shared.frictionCombine = PhysicsMaterialCombineMode.Minimum;
    shared.bounceCombine = PhysicsMaterialCombineMode.Maximum;
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    collider.material = shared;
    other.material = shared;
    collider.material.dynamicFriction = 0.3;
    expect(other.material.dynamicFriction).toBe(0.3);
    expect(createMaterial).not.toHaveBeenCalled();
    const instance = collider.getInstanceMaterial();
    expect(instance).not.toBe(shared);
    expect(collider.material).toBe(instance);
    expect(other.material).toBe(shared);
    for (const key of Object.keys(defaults)) expect(instance[key]).toBe(shared[key]);
    instance.dynamicFriction = 0.9;
    expect(shared.dynamicFriction).toBe(0.3);
    collider.material = instance;
    expect(collider.getInstanceMaterial()).toBe(instance);
    expect(createMaterial).toHaveBeenCalledTimes(1);
    collider.material = shared;
    const replacement = collider.getInstanceMaterial();
    expect(replacement).not.toBe(instance);
    expect(replacement).not.toBe(shared);
    expect(replacement.dynamicFriction).toBe(0.3);
    expect(createMaterial).toHaveBeenCalledTimes(2);
  });

  it("creates independent instances from untouched clone defaults", () => {
    const source = rootEntity.createChild("defaultSource");
    const collider = source.addComponent(BoxCollider);
    const clone = source.clone();
    rootEntity.addChild(clone);
    const material = collider.getInstanceMaterial();
    const cloneMaterial = clone.getComponent(BoxCollider).getInstanceMaterial();
    material.dynamicFriction = 0;
    expect(cloneMaterial).not.toBe(material);
    expect(cloneMaterial.dynamicFriction).toBe(0.6);
  });

  it("preserves default and assigned materials when a live mesh is recooked", () => {
    const collider = rootEntity.createChild("meshMaterial").addComponent(MeshCollider);
    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]);
    mesh.setIndices(new Uint16Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]));
    collider.mesh = mesh;
    sync();
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const createMesh = vi.spyOn(physics, "createMeshColliderShape");
    collider.convex = true;
    expect(createMaterial).not.toHaveBeenCalled();
    expect(collider.material).toBeNull();
    expect(createMesh).toHaveBeenCalledTimes(1);
    const defaultNative = createMesh.mock.calls[0][4];
    const material = collider.getInstanceMaterial();
    material.bounciness = 0.8;
    collider.convex = false;
    expect(createMaterial).toHaveBeenCalledTimes(1);
    expect(createMesh).toHaveBeenCalledTimes(2);
    expect(createMesh.mock.calls[1][4]).toBe(createMaterial.mock.results[0].value);
    expect(createMesh.mock.calls[1][4]).not.toBe(defaultNative);
    expect(collider.material).toBe(material);
    expect(material.refCount).toBe(1);
  });

  it.each([false, true])(
    "loads a shared material and resets to the default without allocating (nested: %s)",
    async (nested) => {
      const collider = rootEntity.createChild().addComponent(BoxCollider);
      const material = new PhysicsMaterial(engine);
      const context = new ParserContext(engine, ParserType.Scene, engine.sceneManager.activeScene);
      const parser = new ReflectionParser(context, [{ url: "physics-material" }]);
      vi.spyOn(engine.resourceManager, "getResourceByRef").mockResolvedValue(material);
      const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
      const props = { material: { $ref: 0 } };
      await parser.parseProps(nested ? { collider } : collider, nested ? { collider: props } : props);
      expect(collider.material).toBe(material);
      expect(createMaterial).not.toHaveBeenCalled();
      await parser.parseProps(collider, { material: { bounciness: 0.7 } });
      expect(collider.material).toBe(material);
      expect(material.bounciness).toBe(0.7);
      await parser.parseProps(collider, { material: null });
      expect(collider.material).toBeNull();
      expect(material.refCount).toBe(0);
      expect(material.destroyed).toBe(false);
      sync();
      expect(createMaterial).not.toHaveBeenCalled();
    }
  );

  it("rejects inline material construction without an engine", async () => {
    Loader.registerClass("PhysicsMaterial", PhysicsMaterial);
    const collider = rootEntity.createChild().addComponent(BoxCollider);
    const context = new ParserContext(engine, ParserType.Scene, engine.sceneManager.activeScene);
    const parser = new ReflectionParser(context, []);
    const before = engine.resourceManager.findResourcesByType(PhysicsMaterial).length;
    await expect(
      parser.parseProps(collider, { material: { $type: "PhysicsMaterial", bounciness: 0.7 } })
    ).rejects.toThrow();
    expect(collider.material).toBeNull();
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial).length).toBe(before);
  });

  it.each([
    { Type: BoxCollider, assigned: false },
    { Type: BoxCollider, assigned: true },
    { Type: CharacterController, assigned: false },
    { Type: CharacterController, assigned: true }
  ])(
    "updates active $Type.name components when instancing or resetting material (assigned: $assigned)",
    ({ Type, assigned }) => {
      const entity = rootEntity.createChild("materialController");
      entity.transform.setPosition(100, 100, 0);
      const controller = entity.addComponent(Type);
      if (controller instanceof CharacterController) controller.geometry = CharacterControllerGeometry.Box;
      const shared = new PhysicsMaterial(engine);
      if (assigned) controller.material = shared;
      const dropProbe = () => {
        const probe = rootEntity.createChild("materialProbe");
        probe.transform.setPosition(100, 104, 0);
        probe.addComponent(Rigidbody);
        probe.addComponent(SphereCollider);
        for (let i = 0; i < 90; i++) engine.sceneManager.activeScene.physics._update(1 / 60);
        const height = probe.transform.position.y;
        probe.destroy();
        return height;
      };
      const defaultRestingHeight = dropProbe();
      const material = controller.getInstanceMaterial();
      material.bounciness = 1;
      material.bounceCombine = PhysicsMaterialCombineMode.Maximum;
      const replacement = new PhysicsMaterial(engine);
      expect(dropProbe()).toBeGreaterThan(defaultRestingHeight + 1);
      controller.enabled = false;
      controller.enabled = true;
      expect(dropProbe()).toBeGreaterThan(defaultRestingHeight + 1);
      expect(shared.bounciness).toBe(0);
      controller.material = replacement;
      expect(material.refCount).toBe(0);
      expect(material.destroyed).toBe(false);
      expect(dropProbe()).toBeCloseTo(defaultRestingHeight, 4);
      controller.material = material;
      expect(dropProbe()).toBeGreaterThan(defaultRestingHeight + 1);
      controller.material = null;
      expect(controller.material).toBeNull();
      expect(dropProbe()).toBeCloseTo(defaultRestingHeight, 4);
      controller.enabled = false;
      controller.enabled = true;
      expect(dropProbe()).toBeCloseTo(defaultRestingHeight, 4);
    }
  );

  it("bounciness", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(3, 5, 0));
    const ground = addPlane(0, -0.5, 0);

    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 1;
    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 0;

    engine.sceneManager.activeScene.physics._update(2);
    expect(boxEntity.transform.position.y).greaterThan(0);
    expect(formatValue(boxEntity2.transform.position.y)).eq(0);
  });

  it.each([false, true])(
    "clones share material references but reset instance ownership (instanced: %s)",
    (instanced) => {
      const sourceEntity = rootEntity.createChild("materialClone");
      const sourceShape = sourceEntity.addComponent(BoxCollider);
      const sourceMaterial = instanced ? sourceShape.getInstanceMaterial() : new PhysicsMaterial(engine);
      sourceShape.material = sourceMaterial;
      sourceMaterial.bounciness = 0.7;
      const destroySpy = vi.spyOn(PhysicsMaterial.prototype, "destroy");
      const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
      const cloneEntity = sourceEntity.clone();
      const cloneShape = cloneEntity.getComponent(BoxCollider);
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
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 1;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Average;

    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0.1775);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider2.automaticCenterOfMass = true;
    collider2.automaticInertiaTensor = true;
    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 0.5;
    ground.getComponent(PlaneCollider).getInstanceMaterial().bounciness = 0.5;
    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Average;

    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity2.transform.position.y)).eq(0.1775);
  });

  it("bounceCombine Minimum", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 1;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Minimum;
    ground.getComponent(PlaneCollider).getInstanceMaterial().bounciness = 0;

    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0);
  });

  it("bounceCombine Maximum", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 0;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Maximum;
    ground.getComponent(PlaneCollider).getInstanceMaterial().bounciness = 1;

    engine.sceneManager.activeScene.physics._update(2);
    // Standard and SIMD solvers differ in the last few float32 bits
    expect(boxEntity.transform.position.y).closeTo(5.16451, 0.00002);
  });

  it("bounceCombine Multiply", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounciness = 1;
    collider.entity.getComponent(BoxCollider).getInstanceMaterial().bounceCombine = PhysicsMaterialCombineMode.Multiply;
    ground.getComponent(PlaneCollider).getInstanceMaterial().bounciness = 0.5;

    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0.1775);
  });

  it("dynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider2.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 1;
    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 0.5;

    collider.applyForce(new Vector3(0, 0, 1000));
    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).greaterThan(boxEntity.transform.position.z);
    expect(collider2.linearVelocity.z).greaterThan(collider.linearVelocity.z);
  });

  it("staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider2.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 2000;
    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 100;

    collider.applyForce(new Vector3(0, 0, 1000));
    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
    expect(boxEntity2.transform.position.z).not.closeTo(0, 0.001);
    expect(boxEntity2.transform.position.z).greaterThan(boxEntity.transform.position.z);
  });

  it("frictionCombine Average staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Average;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 2000;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 0;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 2000;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Minimum staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Minimum;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 2000;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).greaterThan(10);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Minimum;

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 0;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 2000;

    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).greaterThan(10);
  });

  it("frictionCombine Maximum staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Maximum;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 2000;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Maximum;

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().staticFriction = 0;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 2000;

    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).closeTo(0, 0.001);
  });

  it.each([
    [10, 200],
    [100, 20]
  ])("frictionCombine Multiply staticFriction (%s × %s)", (boxFriction, groundFriction) => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    const material = collider.entity.getComponent(BoxCollider).getInstanceMaterial();
    material.frictionCombine = PhysicsMaterialCombineMode.Multiply;
    material.staticFriction = boxFriction;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = groundFriction;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    material.staticFriction = 0;
    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).greaterThan(10);
  });

  it("frictionCombine Average DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Average;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(PlaneCollider).getInstanceMaterial().staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(1.27903);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Average;

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 5;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 5;

    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(1.27903);
  });

  it("frictionCombine Minimum DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Minimum;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(16.66667);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Minimum;

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 0;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 10;

    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(16.66667);
  });

  it("frictionCombine Maximum DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Maximum;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(0.57139);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Maximum;

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 0;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 10;

    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(0.57139);
  });

  it("frictionCombine Multiply DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(Rigidbody);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Multiply;

    collider.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 2;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 5;

    collider.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(0.57139);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().frictionCombine =
      PhysicsMaterialCombineMode.Multiply;

    collider2.entity.getComponent(BoxCollider).getInstanceMaterial().dynamicFriction = 10;
    ground.getComponent(PlaneCollider).getInstanceMaterial().dynamicFriction = 1;

    collider2.applyForce(new Vector3(0, 0, 1000));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(0.57139);
  });

  it("destroy", () => {
    const physicsMaterial = new PhysicsMaterial(engine);
    physicsMaterial.destroy();
    expect(() => {
      physicsMaterial.bounciness = 1;
    }).toThrowError();
  });
});
