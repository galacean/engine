import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BoxCollider,
  CapsuleCollider,
  MeshCollider,
  PhysicsMaterial,
  PlaneCollider,
  Script,
  SphereCollider,
  WebGLEngine
} from "@galacean/engine";
import { createPhysics } from "../../utils/physics";

const colliderTypes = [BoxCollider, CapsuleCollider, MeshCollider, PlaneCollider, SphereCollider];

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

  it.each(colliderTypes)("balances shared material references through %s cloning and destruction", (Type) => {
    const entity = engine.sceneManager.activeScene.createRootEntity();
    const collider = entity.addComponent(Type);
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const material = collider.getInstanceMaterial();
    const nativeDestroy = vi.spyOn(createMaterial.mock.results[0].value, "destroy");
    createMaterial.mockClear();
    expect(material.engine).toBe(engine);
    expect(material.refCount).toBe(1);

    const clone = entity.clone();
    const clonedCollider = clone.getComponent(Type)!;
    expect(clonedCollider).not.toBe(collider);
    expect(clonedCollider.material).toBe(material);
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

  it("retains material while a Collider is disabled or outside the scene and releases replacements for GC", () => {
    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity();
    const collider = entity.addComponent(BoxCollider);
    const original = collider.getInstanceMaterial();
    const material = new PhysicsMaterial(engine);
    collider.material = material;
    expect(original.refCount).toBe(0);
    expect(original.destroyed).toBe(false);
    expect(material.refCount).toBe(1);
    collider.material = material;
    collider.enabled = false;
    scene.removeRootEntity(entity);
    engine.resourceManager.gc();
    expect(original.destroyed).toBe(true);
    expect(material.destroyed).toBe(false);
    expect(material.refCount).toBe(1);
    scene.createRootEntity("parent").addChild(entity);
    collider.enabled = true;
    expect(material.refCount).toBe(1);
    entity.destroy();
    expect(material.refCount).toBe(0);
    expect(material.destroyed).toBe(false);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(true);
  });

  it("registers unused materials for GC and honors the ordinary GC opt-out", () => {
    const material = new PhysicsMaterial(engine);
    const retained = new PhysicsMaterial(engine);
    retained.isGCIgnored = true;
    const resources = engine.resourceManager.findResourcesByType(PhysicsMaterial);
    expect(resources.includes(material)).toBe(true);
    expect(resources.includes(retained)).toBe(true);
    engine.resourceManager.gc();
    expect(material.destroyed).toBe(true);
    expect(retained.destroyed).toBe(false);
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial).includes(material)).toBe(false);
    retained.isGCIgnored = false;
    engine.resourceManager.gc();
    expect(retained.destroyed).toBe(true);
  });

  it("destroys only the owning engine's materials even when engines share a physics backend", async () => {
    const other = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const material = new PhysicsMaterial(engine);
    const otherMaterial = new PhysicsMaterial(other);
    const collider = engine.sceneManager.activeScene.createRootEntity().addComponent(BoxCollider);
    collider.material = material;
    try {
      other.sceneManager.activeScene.createRootEntity().addComponent(BoxCollider).material = otherMaterial;
      other.destroy();
      expect(otherMaterial.destroyed).toBe(true);
      expect(material.destroyed).toBe(false);
      material.bounciness = 0.4;
      engine.update();
      expect(collider.material.bounciness).toBe(0.4);
    } finally {
      other.destroy();
    }
  });

  it.each(colliderTypes)(
    "rejects cross-engine assignment without changing a %s material or reference counts",
    async (Type) => {
      const other = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      const collider = engine.sceneManager.activeScene.createRootEntity().addComponent(Type);
      const shared = new PhysicsMaterial(engine);
      const foreign = new PhysicsMaterial(other);
      const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
      try {
        expect(() => (collider.material = foreign)).toThrow(/another engine/);
        expect(collider.material).toBeNull();
        expect(foreign.refCount).toBe(0);
        collider.material = shared;
        expect(() => (collider.material = foreign)).toThrow(/another engine/);
        expect(createMaterial).not.toHaveBeenCalled();
        expect(collider.material).toBe(shared);
        expect(shared.refCount).toBe(1);
        expect(foreign.refCount).toBe(0);
        const instance = collider.getInstanceMaterial();
        expect(instance.engine).toBe(engine);
        expect(shared.refCount).toBe(0);
        expect(shared.destroyed).toBe(false);
        expect(() => (collider.material = foreign)).toThrow(/another engine/);
        expect(collider.getInstanceMaterial()).toBe(instance);
        expect(instance.refCount).toBe(1);
        expect(foreign.refCount).toBe(0);
        expect(createMaterial).toHaveBeenCalledTimes(1);
      } finally {
        other.destroy();
      }
    }
  );

  it("defers forced destruction during a frame and keeps refCount non-negative after Collider teardown", () => {
    const material = new PhysicsMaterial(engine);
    const entity = engine.sceneManager.activeScene.createRootEntity();
    entity.addComponent(BoxCollider).material = material;
    let pendingDuringUpdate = false;
    class DestroyMaterial extends Script {
      override onUpdate(): void {
        material.destroy(true);
        pendingDuringUpdate = material.pendingDestroy && !material.destroyed;
        this.enabled = false;
      }
    }
    entity.addComponent(DestroyMaterial);
    engine.update();
    expect(pendingDuringUpdate).toBe(true);
    expect(material.destroyed).toBe(true);
    expect(material.refCount).toBe(0);
    entity.destroy();
    expect(material.refCount).toBe(0);
  });

  it("allows reusing an instance after resetting to the default", () => {
    const collider = engine.sceneManager.activeScene.createRootEntity().addComponent(BoxCollider);
    const original = collider.getInstanceMaterial();
    collider.material = null;
    expect(collider.material).toBeNull();
    expect(original.refCount).toBe(0);
    expect(original.destroyed).toBe(false);
    collider.material = original;
    expect(original.refCount).toBe(1);
    const replacement = collider.getInstanceMaterial();
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
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial).includes(clone)).toBe(true);
    expect(clone.bounciness).toBe(0.7);
    clone.bounciness = 0.2;
    expect(material.bounciness).toBe(0.7);
  });
});
