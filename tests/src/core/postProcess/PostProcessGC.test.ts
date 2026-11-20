import {
  BlendShape,
  BloomEffect,
  Camera,
  ModelMesh,
  PostProcess,
  SkinnedMeshRenderer,
  TonemappingEffect,
  TonemappingMode,
  TrailMaterial,
  TrailRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterEach, describe, expect, it } from "vitest";

describe("Internal ReferResource ResourceManager.gc() ownership regression", () => {
  let engine: WebGLEngine | null = null;

  afterEach(() => {
    engine?.destroy();
    engine = null;
  });

  it("keeps active Bloom and Uber Pass materials alive after ResourceManager.gc()", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.enablePostProcess = true;

    const postEntity = scene.createRootEntity("post-process");
    const postProcess = postEntity.addComponent(PostProcess);
    postProcess.isGlobal = true;
    const bloom = postProcess.addEffect(BloomEffect);
    bloom.intensity.value = 1;

    expect(() => engine!.update()).not.toThrow();

    engine.resourceManager.gc();

    expect(() => engine!.update()).not.toThrow();
    const uberPass = engine.postProcessPasses[0] as any;
    expect(uberPass._uberMaterial.destroyed).toBe(false);
    expect(uberPass._bloomMaterial.destroyed).toBe(false);

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

    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.enablePostProcess = true;

    const postEntity = scene.createRootEntity("post-process");
    const postProcess = postEntity.addComponent(PostProcess);
    postProcess.isGlobal = true;
    const tonemapping = postProcess.addEffect(TonemappingEffect);
    tonemapping.mode.value = TonemappingMode.ACES;

    expect(() => engine!.update()).not.toThrow();

    engine.resourceManager.gc();

    expect(() => engine!.update()).not.toThrow();
    const uberPass = engine.postProcessPasses[0] as any;
    expect(uberPass._uberMaterial.destroyed).toBe(false);
  });

  it("keeps active TrailRenderer internal primitive and vertex buffer alive after ResourceManager.gc()", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("camera");
    cameraEntity.addComponent(Camera);

    const trailEntity = scene.createRootEntity("trail");
    const trail = trailEntity.addComponent(TrailRenderer);
    trail.setMaterial(new TrailMaterial(engine));

    engine.update();
    engine.resourceManager.gc();

    const primitive = (trail as any)._primitive;
    const vertexBuffer = (trail as any)._vertexBuffer;
    expect(primitive.destroyed).toBe(false);
    expect(vertexBuffer.destroyed).toBe(false);
    expect(() => engine!.update()).not.toThrow();

    trailEntity.destroy();
    engine.update();
    expect(primitive.destroyed).toBe(true);
    expect(vertexBuffer.destroyed).toBe(true);
  });

  it("keeps BlendShapeManager texture array alive across ResourceManager.gc() when ModelMesh is referenced", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    const entity = scene.createRootEntity("skinned");
    const renderer = entity.addComponent(SkinnedMeshRenderer);
    renderer.enabled = false; // Not yet rendered, so shaderData has not bound _vertexTexture

    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
    // > 8 blend shapes triggers texture mode (Texture2DArray)
    for (let i = 0; i < 10; i++) {
      const bs = new BlendShape(`bs_${i}`);
      bs.addFrame(1, [new Vector3(0, 0.1, 0), new Vector3(0, 0.1, 0), new Vector3(0, 0.1, 0)]);
      mesh.addBlendShape(bs);
    }
    mesh.uploadData(false);
    renderer.mesh = mesh;

    const vertexTexture = (mesh as any)._blendShapeManager._vertexTexture;
    expect(vertexTexture).toBeTruthy();

    engine.resourceManager.gc();
    expect(vertexTexture.destroyed).toBe(false);

    entity.destroy();
    engine.update();
    engine.resourceManager.gc();
    expect(mesh.destroyed).toBe(true);
    expect(vertexTexture.destroyed).toBe(true);
  });
});
