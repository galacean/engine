import {
  BlendShape,
  BloomEffect,
  Camera,
  CubeProbe,
  Engine,
  MeshRenderer,
  ModelMesh,
  PostProcess,
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

  it("does not retain transient Bloom dirt/mip textures on PostProcessUberPass materials after render", async () => {
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

    const scene = engine.sceneManager.activeScene;
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

    const scene = engine.sceneManager.activeScene;
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

    const scene = engine.sceneManager.activeScene;
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

  it("releases CubeProbe render targets via _onDestroy even if a subclass overrides onDestroy without super", async () => {
    class CustomCubeProbe extends CubeProbe {
      userOnDestroyCalled = false;

      override onDestroy(): void {
        this.userOnDestroyCalled = true;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("camera");
    cameraEntity.addComponent(Camera);
    const probe = cameraEntity.addComponent(CustomCubeProbe);
    probe.width = 16;
    probe.height = 16;

    engine.update();

    const rt = (probe as any)._renderTarget;
    const rtSwap = (probe as any)._renderTargetSwap;
    const tex = rt.getColorTexture(0);
    const texSwap = rtSwap.getColorTexture(0);
    expect(rt.refCount).toBe(1);
    expect(rtSwap.refCount).toBe(1);

    cameraEntity.destroy();
    engine.update();
    engine.resourceManager.gc();

    expect(probe.userOnDestroyCalled).toBe(true);
    expect(rt.refCount).toBe(0);
    expect(rtSwap.refCount).toBe(0);
    expect(rt.destroyed).toBe(true);
    expect(rtSwap.destroyed).toBe(true);
    expect(tex.destroyed).toBe(true);
    expect(texSwap.destroyed).toBe(true);
  });

  it("retains CubeProbe render targets across gc() and destroys textures on resize, clone, and destroy", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    engine = await WebGLEngine.create({ canvas });

    const scene = engine.sceneManager.activeScene;
    const cameraEntity = scene.createRootEntity("camera");
    const camera = cameraEntity.addComponent(Camera);
    const probe = cameraEntity.addComponent(CubeProbe);
    probe.width = 16;
    probe.height = 16;

    engine.update();

    const rt1 = (probe as any)._renderTarget;
    const rtSwap1 = (probe as any)._renderTargetSwap;
    const tex1 = rt1.getColorTexture(0);
    const texSwap1 = rtSwap1.getColorTexture(0);
    expect(rt1.refCount).toBe(1);
    expect(rtSwap1.refCount).toBe(1);

    engine.resourceManager.gc();
    expect(rt1.destroyed).toBe(false);
    expect(rtSwap1.destroyed).toBe(false);
    expect(tex1.destroyed).toBe(false);
    expect(texSwap1.destroyed).toBe(false);

    // Simulate external consumer holding tex1 via onTextureChange while texSwap1 is unreferenced
    tex1._addReferCount(1);

    // Resize triggers _destroyRenderTargets() + recreation
    probe.width = 32;
    probe.height = 32;
    engine.update();

    expect(rt1.destroyed).toBe(true);
    expect(rtSwap1.destroyed).toBe(true);
    expect(texSwap1.destroyed).toBe(true);
    expect(texSwap1.refCount).toBe(0);
    // Externally referenced tex1 must remain alive until consumer releases it
    expect(tex1.destroyed).toBe(false);
    expect(tex1.refCount).toBe(1);
    tex1._addReferCount(-1);
    tex1.destroy();
    expect(tex1.destroyed).toBe(true);

    const rt2 = (probe as any)._renderTarget;
    const rtSwap2 = (probe as any)._renderTargetSwap;
    const tex2 = rt2.getColorTexture(0);
    const texSwap2 = rtSwap2.getColorTexture(0);

    // Cloning entity must not share Probe internal render targets
    const clonedEntity = cameraEntity.clone();
    const clonedProbe = clonedEntity.getComponent(CubeProbe)!;
    expect((clonedProbe as any)._renderTarget).toBeUndefined();
    clonedEntity.destroy();
    expect(rt2.destroyed).toBe(false);
    expect(rt2.refCount).toBe(1);

    // Destroying probe releases both render targets and their inline textures immediately
    cameraEntity.destroy();
    engine.update();
    expect(rt2.destroyed).toBe(true);
    expect(rtSwap2.destroyed).toBe(true);
    expect(tex2.destroyed).toBe(true);
    expect(texSwap2.destroyed).toBe(true);
  });
});
