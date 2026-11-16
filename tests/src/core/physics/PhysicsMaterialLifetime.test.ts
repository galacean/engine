import { createPhysics } from "../../utils/physics";
import { BoxCollider, Engine, PhysicsMaterial } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Ray, Vector3 } from "@galacean/engine-math";
import { describe, expect, it, vi } from "vitest";

function addBox(engine: Engine): BoxCollider {
  return engine.sceneManager.activeScene.createRootEntity().addComponent(BoxCollider);
}

function hitsBox(engine: Engine): boolean {
  return engine.sceneManager.activeScene.physics.raycast(new Ray(new Vector3(0, 0, 3), new Vector3(0, 0, -1)), 10);
}

describe("PhysicsMaterial lifetime", () => {
  it("shares one native default across engines using the same backend", async () => {
    const physics = createPhysics();
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const destroyMaterial = vi.spyOn(createMaterial.mock.results[0].value, "destroy");
    const firstCollider = addBox(first);
    expect(hitsBox(first)).toBe(true);
    expect(firstCollider.material).toBeNull();
    let second: Engine;
    let graphicsOnly: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
      const receiving = addBox(second);
      const clone = receiving.entity.clone();
      second.sceneManager.activeScene.addRootEntity(clone);
      expect(clone.getComponent(BoxCollider).material).toBeNull();
      expect(hitsBox(second)).toBe(true);

      graphicsOnly = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      graphicsOnly.destroy();
      first.destroy();
      second.resourceManager.gc();
      expect(destroyMaterial).not.toHaveBeenCalled();
      expect(hitsBox(second)).toBe(true);
      addBox(second);
      expect(hitsBox(second)).toBe(true);
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

  it("restores the shared default on an existing Collider after resetting its assigned material", async () => {
    const physics = createPhysics();
    const createMaterial = vi.spyOn(physics, "createPhysicsMaterial");
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics });
    const collider = addBox(engine);
    const assigned = new PhysicsMaterial(engine);
    try {
      collider.material = assigned;
      expect(hitsBox(engine)).toBe(true);
      collider.enabled = false;
      collider.material = null;
      expect(collider.material).toBeNull();
      expect(assigned.refCount).toBe(0);
      engine.resourceManager.gc();
      expect(assigned.destroyed).toBe(true);
      collider.enabled = true;
      expect(hitsBox(engine)).toBe(true);
      expect(createMaterial).toHaveBeenCalledTimes(2);
    } finally {
      engine.destroy();
      physics.destroy();
      vi.restoreAllMocks();
    }
  });

  it("creates a new native default after the previous backend is destroyed", async () => {
    const firstPhysics = createPhysics();
    const createFirst = vi.spyOn(firstPhysics, "createPhysicsMaterial");
    const first = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: firstPhysics });
    const material = createFirst.mock.results[0].value;
    first.destroy();
    firstPhysics.destroy();

    const secondPhysics = createPhysics();
    const createSecond = vi.spyOn(secondPhysics, "createPhysicsMaterial");
    let second: Engine;
    try {
      second = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: secondPhysics });
      expect(createSecond).toHaveBeenCalledTimes(1);
      expect(createSecond.mock.results[0].value).not.toBe(material);
      const collider = addBox(second);
      expect(collider.material).toBeNull();
      expect(hitsBox(second)).toBe(true);
      expect(createSecond).toHaveBeenCalledTimes(1);
    } finally {
      second?.destroy();
      secondPhysics.destroy();
      vi.restoreAllMocks();
    }
  });
});
