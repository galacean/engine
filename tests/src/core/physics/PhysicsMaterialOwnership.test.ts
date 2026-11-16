import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BoxColliderShape,
  CapsuleColliderShape,
  MeshColliderShape,
  PhysicsMaterial,
  PhysicsMaterialCombineMode,
  PlaneColliderShape,
  Script,
  SphereColliderShape,
  StaticCollider,
  WebGLEngine
} from "@galacean/engine";
import { createPhysics } from "../../utils/physics";

const shapeTypes = [BoxColliderShape, CapsuleColliderShape, MeshColliderShape, PlaneColliderShape, SphereColliderShape];

describe("PhysicsMaterial ownership", () => {
  let engine: WebGLEngine;
  const physics = createPhysics();

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
  });
  afterEach(() => {
    engine.sceneManager.activeScene.rootEntities.slice().forEach((entity) => entity.destroy());
    engine.resourceManager.gc();
    vi.restoreAllMocks();
  });
  afterAll(() => engine.destroy());

  it.each(shapeTypes)("balances shared material references through %s cloning and destruction", (Shape) => {
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new Shape();
    entity.addComponent(StaticCollider).addShape(shape);
    const material = shape.getInstanceMaterial(engine);
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const nativeDestroy = vi.spyOn(material._nativeMaterial, "destroy");
    expect(material.engine).toBe(engine);
    expect(material.refCount).toBe(1);

    const clone = entity.clone();
    const clonedShape = clone.getComponent(StaticCollider)!.shapes[0];
    expect(clonedShape).not.toBe(shape);
    expect(clonedShape.material).toBe(material);
    expect(material.refCount).toBe(2);
    expect(createMaterial).not.toHaveBeenCalled();
    expect(material.destroy()).toBe(false);

    entity.destroy();
    expect(material.refCount).toBe(1);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(false);
    clone.destroy();
    expect(material.refCount).toBe(0);
    expect(material.destroyed).toBe(false);
    expect(nativeDestroy).not.toHaveBeenCalled();
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(true);
    expect(nativeDestroy).toHaveBeenCalledTimes(1);
    material.destroy();
    expect(nativeDestroy).toHaveBeenCalledTimes(1);
  });

  it("keeps detached and moved shapes referenced while replaced materials become eligible for GC", () => {
    const first = engine.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider);
    const second = engine.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider);
    const shape = new BoxColliderShape();
    const original = shape.getInstanceMaterial(engine);
    const material = new PhysicsMaterial(engine);
    shape.material = material;
    expect(original.refCount).toBe(0);
    expect(original.destroyed).toBe(false);
    expect(material.refCount).toBe(1);
    shape.material = material;
    first.addShape(shape);
    second.addShape(shape);
    expect(first.shapes).toHaveLength(0);
    expect(material.refCount).toBe(1);
    second.clearShapes();
    engine.resourceManager.gc();
    expect(original.destroyed).toBe(true);
    expect(material.destroyed).toBe(false);
    expect(material.refCount).toBe(1);
    first.addShape(shape);
    first.removeShape(shape);
    second.addShape(shape);
    second.entity.destroy();
    expect(material.destroyed).toBe(false);
    expect(material.refCount).toBe(0);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(true);
  });

  it("registers unused materials for GC and honors the ordinary GC opt-out", () => {
    const material = new PhysicsMaterial(engine);
    const retained = new PhysicsMaterial(engine);
    retained.isGCIgnored = true;
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).toEqual(
      expect.arrayContaining([material, retained])
    );
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(true);
    expect(retained.destroyed).toBe(false);
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).not.toContain(material);
    retained.isGCIgnored = false;
    engine.resourceManager.gc();
    expect(retained.destroyed).toBe(true);
  });

  it("destroys only the owning engine's materials even when engines share a physics backend", async () => {
    const other = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const material = new PhysicsMaterial(engine);
    const otherMaterial = new PhysicsMaterial(other);
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new BoxColliderShape();
    shape.material = material;
    entity.addComponent(StaticCollider).addShape(shape);
    try {
      const otherShape = new BoxColliderShape();
      otherShape.material = otherMaterial;
      other.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider).addShape(otherShape);
      other.destroy();
      expect(otherMaterial.destroyed).toBe(true);
      expect(material.destroyed).toBe(false);
      material.bounciness = 0.4;
      engine.update();
      expect(shape.material.bounciness).toBe(0.4);
    } finally {
      other.destroy();
    }
  });

  it.each(shapeTypes)("rejects a different owner before allocating or changing a %s material", async (Shape) => {
    const other = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new Shape();
    entity.addComponent(StaticCollider).addShape(shape);
    const shared = new PhysicsMaterial(engine);
    shape.material = shared;
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    try {
      expect(() => shape.getInstanceMaterial(other)).toThrow();
      expect(createMaterial).not.toHaveBeenCalled();
      expect(shape.material).toBe(shared);
      expect(shared.refCount).toBe(1);
      const instance = shape.getInstanceMaterial(engine);
      expect(instance).not.toBe(shared);
      expect(instance.engine).toBe(engine);
      expect(shared.refCount).toBe(0);
      expect(shared.destroyed).toBe(false);
      expect(shape.getInstanceMaterial(engine)).toBe(instance);
      expect(() => shape.getInstanceMaterial(other)).toThrow();
      expect(shape.material).toBe(instance);
      expect(instance.refCount).toBe(1);
      expect(createMaterial).toHaveBeenCalledTimes(1);
    } finally {
      other.destroy();
    }
  });

  it("defers destruction during a frame and rejects new pending references", () => {
    const material = new PhysicsMaterial(engine);
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new BoxColliderShape();
    shape.material = material;
    const collider = entity.addComponent(StaticCollider);
    collider.addShape(shape);
    const second = new BoxColliderShape();
    collider.addShape(second);
    const previous = second.getInstanceMaterial(engine);
    let pendingDuringUpdate = false;
    let assignmentRejected = false;
    class DestroyMaterial extends Script {
      override onUpdate(): void {
        material.destroy(true);
        pendingDuringUpdate = material.pendingDestroy && !material.destroyed;
        try {
          second.material = material;
        } catch {
          assignmentRejected = true;
        }
        this.enabled = false;
      }
    }
    entity.addComponent(DestroyMaterial);
    engine.update();
    expect(pendingDuringUpdate).toBe(true);
    expect(assignmentRejected).toBe(true);
    expect(second.material).toBe(previous);
    expect(previous.refCount).toBe(1);
    expect(material.destroyed).toBe(true);
    expect(material.refCount).toBe(0);
    entity.destroy();
    expect(material.refCount).toBe(0);
    expect(previous.destroyed).toBe(false);
    engine.resourceManager.gc();
    expect(previous.destroyed).toBe(true);
  });

  it("rejects destroyed materials and allows reusing an instance after resetting to the default", () => {
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new BoxColliderShape();
    entity.addComponent(StaticCollider).addShape(shape);
    const original = shape.getInstanceMaterial(engine);
    const destroyed = new PhysicsMaterial(engine);
    destroyed.destroy();
    expect(() => (shape.material = destroyed)).toThrow();
    expect(shape.material).toBe(original);
    expect(original.refCount).toBe(1);
    shape.material = null;
    expect(shape.material).toBeNull();
    expect(original.refCount).toBe(0);
    expect(original.destroyed).toBe(false);
    shape.material = original;
    expect(original.refCount).toBe(1);
    const replacement = shape.getInstanceMaterial(engine);
    expect(replacement).not.toBe(original);
    expect(replacement.engine).toBe(engine);
    expect(replacement.refCount).toBe(1);
    engine.resourceManager.gc();
    expect(original.destroyed).toBe(true);
    expect(replacement.destroyed).toBe(false);
  });

  it("clones independently in the same engine", () => {
    const material = new PhysicsMaterial(engine);
    material.bounciness = 0.7;
    const clone = material.clone();
    expect(clone.engine).toBe(engine);
    expect(clone.refCount).toBe(0);
    expect(clone).not.toBe(material);
    expect(clone._nativeMaterial).not.toBe(material._nativeMaterial);
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).toContain(clone);
    expect(clone.bounciness).toBe(0.7);
    clone.bounciness = 0.2;
    expect(material.bounciness).toBe(0.7);
  });

  it("normalizes coefficients and rejects invalid values before changing state or native data", () => {
    const material = new PhysicsMaterial(engine);
    material.bounciness = 2;
    expect(material.bounciness).toBe(1);
    material.bounciness = -1;
    expect(material.bounciness).toBe(0);
    for (const property of ["staticFriction", "dynamicFriction"] as const) {
      material[property] = -1;
      expect(material[property]).toBe(0);
      material[property] = 2000;
      expect(material[property]).toBe(2000);
    }
    for (const property of ["bounciness", "staticFriction", "dynamicFriction"] as const) {
      const previous = material[property];
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() => (material[property] = value)).toThrow(RangeError);
        expect(material[property]).toBe(previous);
      }
    }
    for (const property of ["bounceCombine", "frictionCombine"] as const) {
      for (const mode of [0, 1, 2, 3]) {
        material[property] = mode;
        expect(material[property]).toBe(mode);
      }
      for (const mode of [-1, 4, 0.5, NaN]) {
        expect(() => (material[property] = mode)).toThrow(RangeError);
        expect(material[property]).toBe(PhysicsMaterialCombineMode.Maximum);
      }
    }
  });
});
