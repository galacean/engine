import {
  BloomEffect,
  Camera,
  Engine,
  MeshRenderer,
  PostProcess,
  Texture2D,
  TonemappingEffect,
  TonemappingMode,
  TrailMaterial,
  TrailRenderer,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
import { HeadlessEngine } from "@galacean/engine-rhi-null";
import { afterEach, describe, expect, it } from "vitest";

describe("Internal ReferResource ResourceManager.gc() ownership regression", () => {
  let engine: WebGLEngine | null = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it("keeps active Bloom and Uber Pass materials alive after ResourceManager.gc() without pinning dirtTexture", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.enablePostProcess = true;

    const postEntity = scene.createRootEntity("post-process");
    const postProcess = postEntity.addComponent(PostProcess);
    postProcess.isGlobal = true;
    const bloom = postProcess.addEffect(BloomEffect)!;
    bloom.intensity.value = 1;
    bloom.dirtIntensity.value = 1;
    const dirtTexture = new Texture2D(engine, 4, 4);
    bloom.dirtTexture.value = dirtTexture;

    expect(() => engine!.update()).not.toThrow();
    expect(dirtTexture.refCount).toBe(0);

    // Detach dirtTexture and run gc(): PostProcessUberPass must not pin dirtTexture,
    // while keeping its own internal materials alive across gc().
    bloom.dirtTexture.value = null;
    engine.resourceManager.gc();

    expect(() => engine!.update()).not.toThrow();
    const uberPass = engine.postProcessPasses[0] as any;
    expect(uberPass._uberMaterial.destroyed).toBe(false);
    expect(uberPass._bloomMaterial.destroyed).toBe(false);
    expect(dirtTexture.destroyed).toBe(true);

    // Ensure materials are properly released when the engine is destroyed
    const uberMat = uberPass._uberMaterial;
    const bloomMat = uberPass._bloomMaterial;
    engine.destroy();
    engine = null;
    expect(uberMat.destroyed).toBe(true);
    expect(bloomMat.destroyed).toBe(true);
  });

  it("keeps Uber Pass material alive for Tonemapping after ResourceManager.gc()", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.enablePostProcess = true;

    const postEntity = scene.createRootEntity("post-process");
    const postProcess = postEntity.addComponent(PostProcess);
    postProcess.isGlobal = true;
    const tonemapping = postProcess.addEffect(TonemappingEffect)!;
    tonemapping.mode.value = TonemappingMode.ACES;

    expect(() => engine!.update()).not.toThrow();

    engine.resourceManager.gc();

    expect(() => engine!.update()).not.toThrow();
    const uberPass = engine.postProcessPasses[0] as any;
    expect(uberPass._uberMaterial.destroyed).toBe(false);
  });

  it("does not leak builtin Uber/Bloom shader refCounts across consecutive HeadlessEngine create/destroy cycles", async () => {
    const firstEngine = await HeadlessEngine.create();
    const uberShader = Engine._builtinShaders.uber;
    const bloomShader = Engine._builtinShaders.bloom;
    const baseUberRef = uberShader._getReferCount();
    const baseBloomRef = bloomShader._getReferCount();
    firstEngine.destroy();

    expect(uberShader._getReferCount()).toBe(baseUberRef);
    expect(bloomShader._getReferCount()).toBe(baseBloomRef);

    const secondEngine = await HeadlessEngine.create();
    expect(uberShader._getReferCount()).toBe(baseUberRef);
    expect(bloomShader._getReferCount()).toBe(baseBloomRef);
    secondEngine.destroy();

    expect(uberShader._getReferCount()).toBe(baseUberRef);
    expect(bloomShader._getReferCount()).toBe(baseBloomRef);
  });

  it("decrements shader and bound texture refCounts when a referenced Material is force-destroyed", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const entity = scene.createRootEntity("mesh");
    const renderer = entity.addComponent(MeshRenderer);

    const texture = new Texture2D(engine, 4, 4);
    const material = new UnlitMaterial(engine);
    const shader = material.shader;
    const shaderBaseRef = shader._getReferCount();
    material.baseTexture = texture;
    renderer.setMaterial(material);

    expect(material.refCount).toBe(1);
    expect(texture.refCount).toBe(1);
    expect(shader._getReferCount()).toBe(shaderBaseRef + 1);

    material.destroy(true);
    expect(material.destroyed).toBe(true);
    expect(material.refCount).toBe(0);
    expect(texture.refCount).toBe(0);
    expect(shader._getReferCount()).toBe(shaderBaseRef);

    // Destroying the renderer afterward must not double-decrement
    entity.destroy();
    engine.update();
    expect(texture.refCount).toBe(0);
    expect(shader._getReferCount()).toBe(shaderBaseRef);
  });

  it("keeps TrailRenderer internal primitive/buffer alive across gc(), destroys old buffers on resize, and releases on destroy", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    cameraEntity.addComponent(Camera);

    const trailEntity = scene.createRootEntity("trail");
    const trail = trailEntity.addComponent(TrailRenderer);
    trail.setMaterial(new TrailMaterial(engine));

    const primitive = (trail as any)._primitive;
    const initialBuffer = (trail as any)._vertexBuffer;

    engine.update();
    engine.resourceManager.gc();
    expect(primitive.destroyed).toBe(false);
    expect(initialBuffer.destroyed).toBe(false);
    expect(() => engine!.update()).not.toThrow();

    // Multiple resizes must immediately destroy superseded vertex buffers
    (trail as any)._resizeBuffer(128);
    const secondBuffer = (trail as any)._vertexBuffer;
    expect(secondBuffer).not.toBe(initialBuffer);
    expect(initialBuffer.destroyed).toBe(true);
    expect(secondBuffer.destroyed).toBe(false);

    (trail as any)._resizeBuffer(128);
    const thirdBuffer = (trail as any)._vertexBuffer;
    expect(thirdBuffer).not.toBe(secondBuffer);
    expect(secondBuffer.destroyed).toBe(true);
    expect(thirdBuffer.destroyed).toBe(false);

    engine.resourceManager.gc();
    expect(primitive.destroyed).toBe(false);
    expect(thirdBuffer.destroyed).toBe(false);

    trailEntity.destroy();
    engine.update();
    expect(primitive.destroyed).toBe(true);
    expect(thirdBuffer.destroyed).toBe(true);
  });
});
