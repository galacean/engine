import {
  BlendShape,
  BloomEffect,
  Camera,
  Engine,
  MeshRenderer,
  ModelMesh,
  PostProcess,
  PostProcessPass,
  RenderTarget,
  SkinnedMeshRenderer,
  Texture2D,
  TonemappingEffect,
  TonemappingMode,
  TrailMaterial,
  TrailRenderer,
  UnlitMaterial,
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

  it("keeps active TrailRenderer internal primitive and vertex buffer alive after ResourceManager.gc()", async () => {
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

    const scene = engine.sceneManager.activeScene!;
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

  it("does not retain transient Bloom dirt/mip textures on PostProcessUberPass materials after render", async () => {
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

    engine.update();

    const uberPass = engine.postProcessPasses[0] as any;
    expect(uberPass._uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).toBeNull();
    expect(uberPass._uberMaterial.shaderData.getTexture(BloomEffect._dirtTextureProp)).toBeNull();
    expect(uberPass._bloomMaterial.shaderData.getTexture(BloomEffect._lowMipTextureProp)).toBeNull();
    expect(dirtTexture.refCount).toBe(0);

    postEntity.destroy();
    engine.update();
    engine.resourceManager.gc();
    expect(dirtTexture.destroyed).toBe(true);
  });

  it("destroys old TrailRenderer vertex buffers across multiple resizes with balanced refCounts", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity("camera");
    cameraEntity.addComponent(Camera);

    const trailEntity = scene.createRootEntity("trail");
    const trail = trailEntity.addComponent(TrailRenderer);
    trail.minVertexDistance = 0.01;
    trail.time = 60;
    trail.setMaterial(new TrailMaterial(engine));

    const primitive = (trail as any)._primitive;
    const initialBuffer = (trail as any)._vertexBuffer;
    expect(primitive.refCount).toBe(1);
    expect(initialBuffer.refCount).toBe(1);

    // Trigger two buffer resizes directly via internal growth path
    (trail as any)._resizeBuffer(128);
    const secondBuffer = (trail as any)._vertexBuffer;
    expect(secondBuffer).not.toBe(initialBuffer);
    expect(initialBuffer.destroyed).toBe(true);
    expect(initialBuffer.refCount).toBe(0);
    expect(secondBuffer.destroyed).toBe(false);
    expect(secondBuffer.refCount).toBe(1);

    (trail as any)._resizeBuffer(128);
    const thirdBuffer = (trail as any)._vertexBuffer;
    expect(thirdBuffer).not.toBe(secondBuffer);
    expect(secondBuffer.destroyed).toBe(true);
    expect(secondBuffer.refCount).toBe(0);
    expect(thirdBuffer.destroyed).toBe(false);
    expect(thirdBuffer.refCount).toBe(1);

    engine.resourceManager.gc();
    expect(primitive.destroyed).toBe(false);
    expect(thirdBuffer.destroyed).toBe(false);

    trailEntity.destroy();
    engine.update();
    expect(primitive.destroyed).toBe(true);
    expect(primitive.refCount).toBe(0);
    expect(thirdBuffer.destroyed).toBe(true);
    expect(thirdBuffer.refCount).toBe(0);
  });

  it("recreates, clears, and force-destroys ModelMesh BlendShape texture array without leaks or double-decrement", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene!;
    const entity = scene.createRootEntity("skinned");
    const renderer = entity.addComponent(SkinnedMeshRenderer);
    renderer.enabled = false;

    const mesh = new ModelMesh(engine);
    mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
    const addBlendShapes = (count: number) => {
      for (let i = 0; i < count; i++) {
        const bs = new BlendShape(`bs_${i}`);
        bs.addFrame(1, [new Vector3(0, 0.1, 0), new Vector3(0, 0.1, 0), new Vector3(0, 0.1, 0)]);
        mesh.addBlendShape(bs);
      }
    };

    addBlendShapes(10);
    mesh.uploadData(false);
    renderer.mesh = mesh;

    const tex1 = (mesh as any)._blendShapeManager._vertexTexture;
    expect(tex1.refCount).toBe(1);

    // Recreation on adding another BlendShape
    const extraBs = new BlendShape("bs_extra");
    extraBs.addFrame(1, [new Vector3(0, 0.1, 0), new Vector3(0, 0.1, 0), new Vector3(0, 0.1, 0)]);
    mesh.addBlendShape(extraBs);
    mesh.uploadData(false);

    const tex2 = (mesh as any)._blendShapeManager._vertexTexture;
    expect(tex2).not.toBe(tex1);
    expect(tex1.destroyed).toBe(true);
    expect(tex1.refCount).toBe(0);
    expect(tex2.destroyed).toBe(false);
    expect(tex2.refCount).toBe(1);

    // Clearing BlendShapes releases texture immediately without waiting for gc()
    mesh.clearBlendShapes();
    expect(tex2.destroyed).toBe(true);
    expect(tex2.refCount).toBe(0);
    expect((mesh as any)._blendShapeManager._vertexTexture).toBeNull();

    // Repeated clear does not double-decrement
    mesh.clearBlendShapes();
    expect(tex2.refCount).toBe(0);

    // Switching from >8 blend shapes (texture mode) back to <=8 (vertex-buffer mode)
    addBlendShapes(10);
    mesh.uploadData(false);
    const texMode = (mesh as any)._blendShapeManager._vertexTexture;
    expect(texMode).toBeTruthy();
    expect(texMode.refCount).toBe(1);

    mesh.clearBlendShapes();
    addBlendShapes(4);
    mesh.uploadData(false);
    expect(texMode.destroyed).toBe(true);
    expect(texMode.refCount).toBe(0);
    expect((mesh as any)._blendShapeManager._vertexTexture).toBeNull();

    // Re-add >8 BlendShapes and force-destroy mesh while refCount === 1
    mesh.clearBlendShapes();
    addBlendShapes(10);
    mesh.uploadData(false);
    const tex3 = (mesh as any)._blendShapeManager._vertexTexture;
    expect(tex3.refCount).toBe(1);

    mesh.destroy(true);
    expect(mesh.destroyed).toBe(true);
    expect(tex3.destroyed).toBe(true);
    expect(tex3.refCount).toBe(0);

    entity.destroy();
    engine.update();
    expect(tex3.refCount).toBe(0);
  });

  it("does not leak builtin Uber/Bloom shader refCounts across consecutive Engine create/destroy cycles", async () => {
    const createCanvas = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      return canvas;
    };

    const firstEngine = await WebGLEngine.create({ canvas: createCanvas() });
    const uberShader = Engine._builtinShaders.uber;
    const bloomShader = Engine._builtinShaders.bloom;
    const initialUberRef = uberShader._getReferCount();
    const initialBloomRef = bloomShader._getReferCount();
    firstEngine.destroy();

    const afterFirstUberRef = uberShader._getReferCount();
    const afterFirstBloomRef = bloomShader._getReferCount();
    expect(afterFirstUberRef).toBe(initialUberRef - 1);
    expect(afterFirstBloomRef).toBe(initialBloomRef - 1);

    const secondEngine = await WebGLEngine.create({ canvas: createCanvas() });
    expect(uberShader._getReferCount()).toBe(afterFirstUberRef + 1);
    expect(bloomShader._getReferCount()).toBe(afterFirstBloomRef + 1);
    secondEngine.destroy();

    expect(uberShader._getReferCount()).toBe(afterFirstUberRef);
    expect(bloomShader._getReferCount()).toBe(afterFirstBloomRef);
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

  it("destroys all PostProcessPasses safely when one custom pass destroys another during Engine.destroy()", async () => {
    class PeerPass extends PostProcessPass {
      onRender(_camera: Camera, _srcTexture: Texture2D, _destTarget: RenderTarget | null): void {}
    }

    class CascadingDestroyPass extends PostProcessPass {
      constructor(
        engine: Engine,
        private readonly _peer: PostProcessPass
      ) {
        super(engine);
      }

      onRender(_camera: Camera, _srcTexture: Texture2D, _destTarget: RenderTarget | null): void {}

      override _onDestroy(): void {
        this._peer.destroy();
        super._onDestroy();
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const testEngine = await WebGLEngine.create({ canvas });
    const uberPass = testEngine.postProcessPasses[0];
    const uberShader = Engine._builtinShaders.uber;
    const bloomShader = Engine._builtinShaders.bloom;
    const uberRefBefore = uberShader._getReferCount();
    const bloomRefBefore = bloomShader._getReferCount();

    const passA = new PeerPass(testEngine);
    const passB = new CascadingDestroyPass(testEngine, passA);
    testEngine.addPostProcessPass(passA);
    testEngine.addPostProcessPass(passB);

    expect(() => testEngine.destroy()).not.toThrow();
    expect(passA.destroyed).toBe(true);
    expect(passB.destroyed).toBe(true);
    expect(uberPass.destroyed).toBe(true);
    expect(uberShader._getReferCount()).toBe(uberRefBefore - 1);
    expect(bloomShader._getReferCount()).toBe(bloomRefBefore - 1);
  });
});
