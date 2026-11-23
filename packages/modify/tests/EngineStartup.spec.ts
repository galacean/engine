import { beforeAll, describe, expect, it, vi } from "vitest";
import type { BuiltinShaders } from "@galacean/engine-core";
import type { IPhysics } from "@galacean/engine-design";
import {
  BoxColliderShape,
  Engine,
  PhysicsMaterial,
  RenderTarget,
  ResourceManager,
  Shader,
  Texture2D,
  TextureFormat
} from "@galacean/engine";
import { WebGPUEngine } from "@galacean/engine-webgpu";
import { HeadlessEngine } from "@galacean/engine-rhi-null";
import { BasicResources } from "../../core/src/BasicResources";

describe("World engine bootstrap", () => {
  let builtinShaders: BuiltinShaders;
  beforeAll(async () => {
    const config = await WebGPUEngine["_prepareConfiguration"]({
      canvas: {} as HTMLCanvasElement,
      webGPUShaderCompiler: { compileWebGPUVariant: vi.fn(), compileDefaultVariant: vi.fn() }
    });
    builtinShaders = config.builtinShaders!;
  });

  it("loads separate native built-in catalogs and the World extensions for both devices", () => {
    const webgl = Engine._builtinShaders;
    expect(webgl.pbr).toBeInstanceOf(Shader);
    expect(webgl.pbr).not.toBe(builtinShaders.pbr);
    expect(webgl.pbr.subShaders[0].passes[0]["_wgsl"]).toBeUndefined();
    expect(builtinShaders.pbr.subShaders[0].passes[0]["_wgsl"]!.vertex).toContain("@vertex");

    expect(builtinShaders.pbr).toBe(Shader.find("PBR"));
    expect(builtinShaders.blit).toBe(Shader.find("Blit/Blit"));
    expect(builtinShaders.skyProcedural).toBe(Shader.find("Sky/SkyProcedural"));
    expect(builtinShaders.particleFeedback).toBe(Shader.find("Effect/ParticleFeedback"));
    expect(builtinShaders.screenSpaceReflection).toBe(Shader.find("Lighting/ScreenSpaceReflection"));
    expect(Shader.find("Pipeline/SSRReceiver")).toBeInstanceOf(Shader);
    expect(Shader.find("Pipeline/SSRContributionDepth")).toBeInstanceOf(Shader);
    const feedback = builtinShaders.particleFeedback.subShaders[0].passes[0]["_wgsl"]!;
    expect(feedback.reflection.vertexOutputs.map((output) => output.name)).toEqual([
      "v_FeedbackPosition",
      "v_FeedbackVelocity"
    ]);
  });

  it("owns one platform render target and releases its attachments after a failed allocation", ({ onTestFinished }) => {
    return HeadlessEngine.create({ builtinShaders }).then((engine) => {
      onTestFinished(() => engine.destroy());
      const color = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8A8_UNorm, false);
      const depth = new Texture2D(engine, 2, 2, TextureFormat.Depth16, false);
      const bytes = engine.renderingStatistics.textureMemory;
      const allocate = vi.spyOn(engine._hardwareRenderer, "createPlatformRenderTarget");
      const create = () => new RenderTarget(engine, 2, 2, color, depth, 2);
      const cause = new Error("render target allocation failed");
      allocate.mockImplementationOnce(() => {
        throw cause;
      });
      expect(create).toThrow(cause);
      expect(allocate).toHaveBeenCalledTimes(1);
      expect([color.refCount, depth.refCount, engine.renderingStatistics.textureMemory]).toEqual([0, 0, bytes]);

      const target = create();
      expect(allocate).toHaveBeenCalledTimes(2);
      expect([color.refCount, depth.refCount]).toEqual([1, 1]);
      expect(engine.renderingStatistics.textureMemory).toBeGreaterThan(bytes);
      const release = vi.spyOn(target._platformRenderTarget, "destroy");
      target.destroy();
      expect(release).toHaveBeenCalledOnce();
      expect([color.refCount, depth.refCount, engine.renderingStatistics.textureMemory]).toEqual([0, 0, bytes]);
    });
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
      createPhysicsScene: vi.fn(() => ({ setContactEventEnabled() {}, destroy() {} })),
      createPhysicsManager: vi.fn(() => ({})),
      createBoxColliderShape: vi.fn(() => nativeShape)
    };
    const createEngine = () => HeadlessEngine.create({ builtinShaders, physics: physics as unknown as IPhysics });
    const engines: HeadlessEngine[] = [];
    let shape: BoxColliderShape | undefined;
    try {
      Engine._nativePhysics = undefined!;
      BasicResources.physicsDefaultMaterial = undefined!;
      ResourceManager._loaders = {};
      engines.push(await createEngine());
      expect(BasicResources.physicsDefaultMaterial).toBeInstanceOf(PhysicsMaterial);
      expect(physics.createPhysicsMaterial).toHaveBeenCalledExactlyOnceWith(PhysicsMaterial._defaultProperties);

      shape = new BoxColliderShape();
      expect(shape.material).toBeNull();
      expect(physics.createBoxColliderShape).toHaveBeenCalledWith(shape.id, shape.size, nativeMaterial);

      const sharedMaterial = BasicResources.physicsDefaultMaterial;
      engines.push(await createEngine());
      expect(BasicResources.physicsDefaultMaterial).toBe(sharedMaterial);
      expect(physics.createPhysicsMaterial).toHaveBeenCalledTimes(1);
      expect(physics.createPhysicsManager).toHaveBeenCalledTimes(2);
    } finally {
      shape?._destroy();
      for (const engine of engines) engine.destroy();
      Engine._nativePhysics = previousPhysics;
      BasicResources.physicsDefaultMaterial = previousMaterial;
      ResourceManager._loaders = previousLoaders;
    }
  });
});
