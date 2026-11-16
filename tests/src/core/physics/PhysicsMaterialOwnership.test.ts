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
    const material = shape.material;
    const nativeDestroy = vi.spyOn(Object.getPrototypeOf(material._nativeMaterial), "destroy");
    expect(material.refCount).toBe(1);

    const clone = entity.clone();
    const clonedShape = clone.getComponent(StaticCollider)!.shapes[0];
    expect(clonedShape).not.toBe(shape);
    expect(clonedShape.material).toBe(material);
    expect(material.refCount).toBe(2);
    expect(nativeDestroy).toHaveBeenCalledTimes(1);
    expect(material.destroy()).toBe(false);

    entity.destroy();
    expect(material.refCount).toBe(1);
    expect(material.destroyed).toBe(false);
    clone.destroy();
    expect(material.refCount).toBe(0);
    expect(material.destroyed).toBe(true);
    expect(nativeDestroy).toHaveBeenCalledTimes(2);
    material.destroy();
    expect(nativeDestroy).toHaveBeenCalledTimes(2);
  });

  it("releases replaced defaults while detached and moved shapes retain their material", () => {
    const first = engine.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider);
    const second = engine.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider);
    const shape = new BoxColliderShape();
    const original = shape.material;
    const material = new PhysicsMaterial();
    shape.material = material;
    expect(original.destroyed).toBe(true);
    expect(material.refCount).toBe(1);
    shape.material = material;
    first.addShape(shape);
    second.addShape(shape);
    expect(first.shapes).toHaveLength(0);
    expect(material.refCount).toBe(1);
    second.clearShapes();
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(false);
    expect(material.refCount).toBe(1);
    first.addShape(shape);
    first.removeShape(shape);
    second.addShape(shape);
    second.entity.destroy();
    expect(material.destroyed).toBe(true);
    expect(material.refCount).toBe(0);
  });

  it("keeps engine-owned materials until GC after the last shape is destroyed", () => {
    const material = new PhysicsMaterial(engine);
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new BoxColliderShape();
    shape.material = material;
    entity.addComponent(StaticCollider).addShape(shape);
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).toContain(material);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(false);
    entity.destroy();
    expect(material.refCount).toBe(0);
    expect(material.destroyed).toBe(false);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(true);
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).not.toContain(material);
  });

  it("keeps a shared material alive when one engine is destroyed", async () => {
    const other = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const material = new PhysicsMaterial();
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const first = new BoxColliderShape();
    first.material = material;
    entity.addComponent(StaticCollider).addShape(first);
    try {
      const second = new BoxColliderShape();
      second.material = material;
      other.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider).addShape(second);
      expect(material.refCount).toBe(2);
      other.destroy();
      expect(material.refCount).toBe(1);
      expect(material.destroyed).toBe(false);
      material.bounciness = 0.4;
      engine.update();
      expect(first.material.bounciness).toBe(0.4);
      entity.destroy();
      expect(material.destroyed).toBe(true);
      expect(material.refCount).toBe(0);
    } finally {
      other.destroy();
    }
  });

  it("defers engine-owned destruction during a frame and rejects new pending references", () => {
    const material = new PhysicsMaterial(engine);
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new BoxColliderShape();
    shape.material = material;
    const collider = entity.addComponent(StaticCollider);
    collider.addShape(shape);
    const second = new BoxColliderShape();
    collider.addShape(second);
    const previous = second.material;
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
    expect(previous.destroyed).toBe(true);
  });

  it("rejects destroyed or null materials without changing the shape's material", () => {
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const shape = new BoxColliderShape();
    entity.addComponent(StaticCollider).addShape(shape);
    const original = shape.material;
    const destroyed = new PhysicsMaterial();
    destroyed.destroy();
    expect(() => (shape.material = destroyed)).toThrow();
    expect(() => (shape.material = null!)).toThrow();
    expect(shape.material).toBe(original);
    expect(original.refCount).toBe(1);
  });

  it("normalizes coefficients and rejects invalid values before changing state or native data", () => {
    const material = new PhysicsMaterial();
    try {
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
    } finally {
      material.destroy();
    }
  });
});
