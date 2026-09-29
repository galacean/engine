import { BoxColliderShape, Engine, PhysicsMaterial, StaticCollider } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Ray, Vector3 } from "@galacean/engine-math";
import { PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { describe, expect, it, vi } from "vitest";
import { createPhysics } from "./PhysicsTestUtils";

const runtimeModes = [PhysXRuntimeMode.WebAssembly, PhysXRuntimeMode.WebAssemblySIMD];

function getDefaultMaterial(engine: Engine): PhysicsMaterial {
  return (engine as any)._basicResources.constructor.physicsDefaultMaterial;
}

function addBox(engine: Engine): BoxColliderShape {
  const shape = new BoxColliderShape();
  engine.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider).addShape(shape);
  return shape;
}

describe.each(runtimeModes)("PhysicsMaterial lifetime (%s)", (runtimeMode) => {
  it("shares one Core default across engines using the same backend", async () => {
    const physics = createPhysics(runtimeMode);
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const material = getDefaultMaterial(first);
    const destroyMaterial = vi.spyOn(material, "destroy");
    const firstShape = addBox(first);
    let second: Engine;
    let graphicsOnly: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      expect(getDefaultMaterial(second)).toBe(material);
      const receiving = second.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider);
      receiving.addShape(firstShape);
      const clone = receiving.entity.clone();
      second.sceneManager.activeScene.addRootEntity(clone);
      const clonedShape = clone.getComponent(StaticCollider).shapes[0];
      expect(clonedShape.material).toBeNull();
      expect((clonedShape._nativeShape as any)._pxMaterial).toBe((material._nativeMaterial as any)._pxMaterial);

      graphicsOnly = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      graphicsOnly.destroy();
      first.destroy();
      second.resourceManager.gc();
      expect(destroyMaterial).not.toHaveBeenCalled();
      expect(
        second.sceneManager.activeScene.physics.raycast(new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)), 10)
      ).toBe(true);
      addBox(second);
      expect(createMaterial).toHaveBeenCalledTimes(1);
      second.destroy();
      expect(destroyMaterial).not.toHaveBeenCalled();
    } finally {
      graphicsOnly?.destroy();
      first.destroy();
      second?.destroy();
      physics.destroy();
      vi.restoreAllMocks();
    }
  });

  it("keeps a detached shape's default alive until backend teardown", async () => {
    const physics = createPhysics(runtimeMode);
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const material = getDefaultMaterial(first);
    const releaseMaterial = vi.spyOn((material._nativeMaterial as any)._pxMaterial, "release");
    const releasePhysics = vi.spyOn(physics._pxPhysics, "release");
    const shape = new BoxColliderShape();
    const assigned = new PhysicsMaterial();
    let second: Engine;
    try {
      shape.material = assigned;
      first.destroy();
      expect(releaseMaterial).not.toHaveBeenCalled();
      shape.material = null;
      expect((shape._nativeShape as any)._pxMaterial).toBe((material._nativeMaterial as any)._pxMaterial);
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      expect(getDefaultMaterial(second)).toBe(material);
      second.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider).addShape(shape);
      expect(
        second.sceneManager.activeScene.physics.raycast(new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)), 10)
      ).toBe(true);
    } finally {
      first.destroy();
      second?.destroy();
      shape._destroy();
      assigned.destroy();
      physics.destroy();
      expect(releasePhysics).toHaveBeenCalledTimes(1);
      // PxPhysics releases its remaining materials internally
      expect(releaseMaterial).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it("reuses the Core default when a later backend is initialized", async () => {
    const firstPhysics = createPhysics(runtimeMode);
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: firstPhysics });
    const material = getDefaultMaterial(first);
    const firstNative = material._nativeMaterial;
    first.destroy();
    firstPhysics.destroy();

    const secondPhysics = createPhysics(runtimeMode);
    let second: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: secondPhysics });
      expect(getDefaultMaterial(second)).toBe(material);
      expect(material._nativeMaterial).not.toBe(firstNative);
      const shape = addBox(second);
      expect((shape._nativeShape as any)._pxMaterial).toBe((material._nativeMaterial as any)._pxMaterial);
    } finally {
      second?.destroy();
      if (second) {
        secondPhysics.destroy();
      }
    }
  });
});
