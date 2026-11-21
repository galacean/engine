import { describe, expect, it, vi } from "vitest";
import type { IPhysics } from "@galacean/engine-design";
import { BoxColliderShape, Engine, PhysicsMaterial, ResourceManager, Shader } from "@galacean/engine";
import { BasicResources } from "../../core/src/BasicResources";

describe("World engine bootstrap", () => {
  it("initializes the native built-in shader references and World extensions", () => {
    expect(Engine._builtinShaders.pbr).toBe(Shader.find("PBR"));
    expect(Engine._builtinShaders.blit).toBe(Shader.find("Blit/Blit"));
    expect(Engine._builtinShaders.skyProcedural).toBe(Shader.find("Sky/SkyProcedural"));
    expect(Engine._builtinShaders.particleFeedback).toBe(Shader.find("Effect/ParticleFeedback"));
    expect(Engine._builtinShaders.screenSpaceReflection).toBe(Shader.find("Lighting/ScreenSpaceReflection"));
    expect(Shader.find("Pipeline/SSRReceiver")).toBeInstanceOf(Shader);
    expect(Shader.find("Pipeline/SSRContributionDepth")).toBeInstanceOf(Shader);
    expect(Engine._builtinShaders.particleFeedback.subShaders[0].passes[0]._feedbackVaryings).toEqual([
      "v_FeedbackPosition",
      "v_FeedbackVelocity"
    ]);
  });

  it("creates the shared physics material before colliders and reuses it for the same backend", async () => {
    const previousPhysics = Engine._nativePhysics;
    const previousMaterial = BasicResources.physicsDefaultMaterial;
    const previousLoaders = ResourceManager._loaders;
    const nativeMaterial = { destroy: vi.fn() };
    const nativeShape = { destroy: vi.fn() };
    const physics = {
      initialize: vi.fn(async () => undefined),
      createPhysicsMaterial: vi.fn(() => nativeMaterial),
      createPhysicsManager: vi.fn(() => ({})),
      createBoxColliderShape: vi.fn(() => nativeShape)
    };
    const createEngineShell = () =>
      Object.assign(Object.create(Engine.prototype), {
        _basicResources: { _initialize: async () => undefined }
      }) as Engine;
    let shape: BoxColliderShape | undefined;
    try {
      Engine._nativePhysics = undefined!;
      BasicResources.physicsDefaultMaterial = undefined!;
      ResourceManager._loaders = {};
      const engine = createEngineShell();
      await engine["_initialize"]({ physics: physics as unknown as IPhysics });
      expect(BasicResources.physicsDefaultMaterial).toBeInstanceOf(PhysicsMaterial);
      expect(physics.createPhysicsMaterial).toHaveBeenCalledExactlyOnceWith(PhysicsMaterial._defaultProperties);

      shape = new BoxColliderShape();
      expect(shape.material).toBeNull();
      expect(physics.createBoxColliderShape).toHaveBeenCalledWith(shape.id, shape.size, nativeMaterial);

      const sharedMaterial = BasicResources.physicsDefaultMaterial;
      await createEngineShell()["_initialize"]({ physics: physics as unknown as IPhysics });
      expect(BasicResources.physicsDefaultMaterial).toBe(sharedMaterial);
      expect(physics.createPhysicsMaterial).toHaveBeenCalledTimes(1);
      expect(physics.createPhysicsManager).toHaveBeenCalledTimes(2);
    } finally {
      shape?._destroy();
      Engine._nativePhysics = previousPhysics;
      BasicResources.physicsDefaultMaterial = previousMaterial;
      ResourceManager._loaders = previousLoaders;
    }
  });
});
