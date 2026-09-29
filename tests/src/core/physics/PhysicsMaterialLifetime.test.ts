import { BoxColliderShape, Engine, PhysicsMaterial, StaticCollider } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Ray, Vector3 } from "@galacean/engine-math";
import { PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { describe, expect, it, vi } from "vitest";
import { createPhysics } from "./PhysicsTestUtils";

const runtimeModes = [PhysXRuntimeMode.WebAssembly, PhysXRuntimeMode.WebAssemblySIMD];

function getDefaultMaterial(engine: Engine): PhysicsMaterial {
  return (engine as any)._basicResources.physicsDefaultMaterial;
}

function addBox(engine: Engine): BoxColliderShape {
  const shape = new BoxColliderShape();
  engine.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider).addShape(shape);
  return shape;
}

describe.each(runtimeModes)("PhysicsMaterial lifetime (%s)", (runtimeMode) => {
  it("releases the BasicResources default after shapes, without destroying assigned materials", async () => {
    const physics = createPhysics(runtimeMode);
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const defaultMaterial = getDefaultMaterial(engine);
    const destroyDefault = vi.spyOn(defaultMaterial, "destroy");
    const releaseDefault = vi.spyOn((defaultMaterial._nativeMaterial as any)._pxMaterial, "release");
    const shape = addBox(engine);
    const destroyShape = vi.spyOn(shape._nativeShape, "destroy");
    const assigned = new PhysicsMaterial();
    const releaseAssigned = vi.spyOn((assigned._nativeMaterial as any)._pxMaterial, "release");
    try {
      shape.material = assigned;
      engine.resourceManager.gc();
      expect(destroyDefault).not.toHaveBeenCalled();
      shape.material = null;
      expect((shape._nativeShape as any)._pxMaterial).toBe((defaultMaterial._nativeMaterial as any)._pxMaterial);

      engine.destroy();
      engine.destroy();
      expect(destroyDefault).toHaveBeenCalledTimes(1);
      expect(releaseDefault).toHaveBeenCalledTimes(1);
      expect(destroyShape.mock.invocationCallOrder[0]).toBeLessThan(releaseDefault.mock.invocationCallOrder[0]);
      expect(releaseAssigned).not.toHaveBeenCalled();

      assigned.destroy();
      expect(releaseAssigned).toHaveBeenCalledTimes(1);
    } finally {
      engine.destroy();
      assigned.destroy();
      physics.destroy();
      expect(releaseDefault).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    }
  });

  it("owns one default per engine even when engines share a backend", async () => {
    const physics = createPhysics(runtimeMode);
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const firstDefault = getDefaultMaterial(first);
    const destroyFirst = vi.spyOn(firstDefault, "destroy");
    const firstShape = addBox(first);
    let second: Engine;
    let next: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      const secondDefault = getDefaultMaterial(second);
      const destroySecond = vi.spyOn(secondDefault, "destroy");
      const secondShape = addBox(second);
      expect(secondDefault).toBeInstanceOf(PhysicsMaterial);
      expect(secondDefault).not.toBe(firstDefault);
      expect((secondShape._nativeShape as any)._pxMaterial).toBe((secondDefault._nativeMaterial as any)._pxMaterial);

      const clone = firstShape.collider.entity.clone();
      first.sceneManager.activeScene.addRootEntity(clone);
      const clonedShape = clone.getComponent(StaticCollider).shapes[0];
      expect(clonedShape.material).toBeNull();
      expect((clonedShape._nativeShape as any)._pxMaterial).toBe((firstDefault._nativeMaterial as any)._pxMaterial);
      expect(createMaterial).toHaveBeenCalledTimes(2);

      first.destroy();
      expect(destroyFirst).toHaveBeenCalledTimes(1);
      expect(destroySecond).not.toHaveBeenCalled();
      expect(
        second.sceneManager.activeScene.physics.raycast(new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)), 10)
      ).toBe(true);
      const newShape = addBox(second);
      expect((newShape._nativeShape as any)._pxMaterial).toBe((secondDefault._nativeMaterial as any)._pxMaterial);

      second.destroy();
      expect(destroySecond).toHaveBeenCalledTimes(1);
      expect((Engine as any)._physicsEngine).toBeNull();

      next = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      expect(getDefaultMaterial(next)).not.toBe(secondDefault);
      expect(createMaterial).toHaveBeenCalledTimes(3);
      addBox(next);
    } finally {
      first.destroy();
      second?.destroy();
      next?.destroy();
      physics.destroy();
      vi.restoreAllMocks();
    }
  });

  it("uses the receiving engine's default when transferring a shape", async () => {
    const physics = createPhysics(runtimeMode);
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const defaultShape = addBox(first);
    const assignedShape = addBox(first);
    const assigned = new PhysicsMaterial();
    assignedShape.material = assigned;
    let second: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      const receiving = second.sceneManager.activeScene.createRootEntity().addComponent(StaticCollider);
      receiving.addShape(defaultShape);
      receiving.addShape(assignedShape);
      const nativeDefault = (getDefaultMaterial(second)._nativeMaterial as any)._pxMaterial;
      expect(defaultShape.material).toBeNull();
      expect((defaultShape._nativeShape as any)._pxMaterial).toBe(nativeDefault);
      expect((assignedShape._nativeShape as any)._pxMaterial).toBe((assigned._nativeMaterial as any)._pxMaterial);

      first.destroy();
      assignedShape.material = null;
      expect((assignedShape._nativeShape as any)._pxMaterial).toBe(nativeDefault);
      expect(
        second.sceneManager.activeScene.physics.raycast(new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)), 10)
      ).toBe(true);
    } finally {
      first.destroy();
      second?.destroy();
      assigned.destroy();
      physics.destroy();
    }
  });

  it("restores a shape's original default after another physics backend is selected", async () => {
    const firstPhysics = createPhysics(runtimeMode);
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: firstPhysics });
    const firstDefault = getDefaultMaterial(first);
    const shape = addBox(first);
    const assigned = new PhysicsMaterial();
    shape.material = assigned;
    const secondPhysics = createPhysics(runtimeMode);
    let second: Engine;
    let graphicsOnly: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: secondPhysics });
      expect(getDefaultMaterial(second)).not.toBe(firstDefault);
      shape.material = null;
      expect((shape._nativeShape as any)._pxMaterial).toBe((firstDefault._nativeMaterial as any)._pxMaterial);

      graphicsOnly = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      expect(getDefaultMaterial(graphicsOnly)).toBeUndefined();
      graphicsOnly.destroy();
      first.destroy();
      expect((Engine as any)._nativePhysics).toBe(secondPhysics);
      const secondShape = addBox(second);
      expect((secondShape._nativeShape as any)._pxMaterial).toBe(
        (getDefaultMaterial(second)._nativeMaterial as any)._pxMaterial
      );
    } finally {
      graphicsOnly?.destroy();
      first.destroy();
      second?.destroy();
      assigned.destroy();
      firstPhysics.destroy();
      if (second) {
        secondPhysics.destroy();
      }
    }
  });
});
