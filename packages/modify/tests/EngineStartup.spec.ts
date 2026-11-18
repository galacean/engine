import { describe, expect, it, vi } from "vitest";
import type { IPhysics } from "@galacean/engine-design";
import { BoxColliderShape, Engine, PhysicsMaterial, ResourceManager, SceneManager, Shader } from "@galacean/engine";
import { BasicResources } from "../../core/src/BasicResources";
import { NullGraphicDevice } from "../../rhi-null/src/NullGraphicDevice";

describe("World engine bootstrap", () => {
  it("initializes the native built-in shader references and World extensions", () => {
    expect(Engine._builtinShaders.pbr).toBe(Shader.find("PBR"));
    expect(Engine._builtinShaders.blit).toBe(Shader.find("Blit/Blit"));
    expect(Engine._builtinShaders.skyProcedural).toBe(Shader.find("Sky/SkyProcedural"));
    expect(Engine._builtinShaders.particleFeedback).toBe(Shader.find("Effect/ParticleFeedback"));
    expect(Shader.find("Pipeline/ScreenSpaceReflectionSurface")).toBeInstanceOf(Shader);
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
      createPhysicsScene: vi.fn(() => ({ setContactEventEnabled: vi.fn() })),
      createBoxColliderShape: vi.fn(() => nativeShape)
    };
    const createEngineShell = () => {
      const engine = Object.create(Engine.prototype) as Engine;
      Object.assign(engine, {
        _basicResources: { _initialize: async () => undefined },
        _hardwareRenderer: new NullGraphicDevice(),
        _renderingStatistics: { _bufferMemory: 0 },
        _resourceManager: new ResourceManager(engine),
        _sceneManager: new SceneManager(engine)
      });
      return engine;
    };
    let shape: BoxColliderShape | undefined;
    try {
      Engine._nativePhysics = undefined!;
      BasicResources.physicsDefaultMaterial = undefined!;
      ResourceManager._loaders = {};
      const engine = createEngineShell();
      await engine["_initialize"]({ physics: physics as unknown as IPhysics });
      expect(engine.sceneManager.activeScene?.name).toBe("DefaultScene");
      expect(physics.createPhysicsScene).toHaveBeenCalledExactlyOnceWith(engine._nativePhysicsManager);
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
