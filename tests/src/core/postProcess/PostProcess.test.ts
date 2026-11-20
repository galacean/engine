import { createPhysics } from "../../utils/physics";
import { Color } from "@galacean/engine";
import {
  Blitter,
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Engine,
  Entity,
  MeshRenderer,
  PostProcess,
  PostProcessEffect,
  PostProcessEffectBoolParameter,
  PostProcessEffectFloatParameter,
  PostProcessPass,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  SphereColliderShape,
  StaticCollider,
  Texture2D,
  TextureFormat,
  TonemappingEffect,
  UnlitMaterial
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class CustomPass extends PostProcessPass {
  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {}
}

export class CustomEffect extends PostProcessEffect {
  intensity = new PostProcessEffectFloatParameter(0, 0, 1);
}

describe("PostProcess", () => {
  let engine: Engine;
  let scene: Scene;
  let uberPass: PostProcessPass = null;
  let postEntity: Entity = null;
  let camera: Camera;

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    scene = engine.sceneManager.scenes[0];
    const passes = engine.postProcessPasses;
    uberPass = passes[0];
    const cameraEntity = scene.createRootEntity("camera");
    camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = true;
  });

  afterAll(() => {
    engine.destroy();
  });

  beforeEach(() => {
    postEntity = scene.createRootEntity("post-process");
  });

  afterEach(() => {
    postEntity.destroy();
  });

  it("Post Process isActive", () => {
    const ppManager = scene.postProcessManager;
    const pp = postEntity.addComponent(PostProcess);

    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    // Test effect
    const bloomEffect = pp.addEffect(BloomEffect);
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    bloomEffect.enabled = false;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    bloomEffect.enabled = true;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    bloomEffect.intensity.value = 1;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.true;

    // Test PostProcess disable
    pp.enabled = false;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    pp.enabled = true;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.true;

    // Test pass isActive
    uberPass.isActive = false;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    uberPass.isActive = true;
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.true;

    // Test effect remove
    const removedBloomEffect = pp.removeEffect(BloomEffect);
    expect(removedBloomEffect).to.instanceOf(BloomEffect);
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    // Test component destroy
    pp.destroy();
    engine.update();
    // @ts-ignore
    expect(ppManager._isValid()).to.false;

    // Test entity destroy
    {
      const pp = postEntity.addComponent(PostProcess);
      pp.addEffect(TonemappingEffect);
      engine.update();
      // @ts-ignore
      expect(ppManager._isValid()).to.true;

      postEntity.destroy();
      engine.update();
      // @ts-ignore
      expect(ppManager._isValid()).to.false;
    }
  });

  it("Post Process Effect", () => {
    const pp = postEntity.addComponent(PostProcess);

    expect(pp.getEffect(BloomEffect)).to.undefined;
    // @ts-ignore
    expect(pp._effects.length).to.equal(0);

    const bloomEffect = pp.addEffect(BloomEffect);
    expect(bloomEffect).to.instanceOf(BloomEffect);

    const bloomEffectRepeat = pp.addEffect(BloomEffect);
    expect(bloomEffectRepeat).to.undefined;

    // @ts-ignore
    expect(pp._effects.length).to.equal(1);
    expect(pp.removeEffect(TonemappingEffect)).to.undefined;

    // Test Bloom parameters
    expect(bloomEffect.highQualityFiltering.value).to.false;
    expect(bloomEffect.downScale.value).to.equal(BloomDownScaleMode.Half);
    expect(bloomEffect.maxIterations.value).to.equal(6);
    expect(bloomEffect.dirtTexture.value).to.null;
    expect(bloomEffect.threshold.value).to.equal(0.8);
    expect(bloomEffect.scatter.value).to.equal(0.7);
    expect(bloomEffect.intensity.value).to.equal(0);
    expect(bloomEffect.dirtIntensity.value).to.equal(0);
    expect(bloomEffect.tint.value).to.include(new Color(1, 1, 1, 1));

    // Clamp maxIterations
    bloomEffect.maxIterations.value = 0;
    expect(bloomEffect.maxIterations.value).to.equal(1);
    bloomEffect.maxIterations.value = 16;
    expect(bloomEffect.maxIterations.value).to.equal(8);
    bloomEffect.maxIterations.value = 6;

    // Test remove effect
    const removedBloomEffect = pp.removeEffect(BloomEffect);
    expect(removedBloomEffect).to.instanceOf(BloomEffect);
    expect(removedBloomEffect).to.equal(bloomEffect);
    // @ts-ignore
    expect(pp._effects.length).to.equal(0);
  });

  it("Post Process clone", () => {
    const pp = postEntity.addComponent(PostProcess);
    const bloomEffect = pp.addEffect(BloomEffect);
    const dirtTexture = new Texture2D(engine, 1, 1);

    bloomEffect.intensity.value = 1.5;
    bloomEffect.threshold.value = 0.9;
    bloomEffect.maxIterations.value = 4;
    bloomEffect.tint.value = new Color(0.5, 0.25, 0.1, 1);
    bloomEffect.highQualityFiltering.value = true;
    bloomEffect.dirtTexture.value = dirtTexture;
    bloomEffect.enabled = false;

    const refCount = dirtTexture.refCount;

    const cloneEntity = postEntity.clone();
    const clonePP = cloneEntity.getComponent(PostProcess);
    const cloneBloom = clonePP.getEffect(BloomEffect);

    // Effects, effect and parameters are all fresh instances.
    expect(clonePP).to.not.equal(pp);
    // @ts-ignore
    expect(clonePP._effects).to.not.equal(pp._effects);
    // @ts-ignore
    expect(clonePP._effects.length).to.equal(1);
    expect(cloneBloom).to.instanceOf(BloomEffect);
    expect(cloneBloom).to.not.equal(bloomEffect);
    expect(cloneBloom.intensity).to.not.equal(bloomEffect.intensity);
    expect(cloneBloom.tint).to.not.equal(bloomEffect.tint);

    // Values are preserved.
    expect(cloneBloom.intensity.value).to.equal(1.5);
    expect(cloneBloom.threshold.value).to.equal(0.9);
    expect(cloneBloom.maxIterations.value).to.equal(4);
    expect(cloneBloom.highQualityFiltering.value).to.true;
    expect(cloneBloom.enabled).to.false;
    expect(cloneBloom.tint.value).to.include(new Color(0.5, 0.25, 0.1, 1));

    // Values are independent: mutating the clone leaves the source untouched.
    expect(cloneBloom.tint.value).to.not.equal(bloomEffect.tint.value);
    cloneBloom.tint.value.r = 0.9;
    expect(bloomEffect.tint.value.r).to.equal(0.5);
    cloneBloom.intensity.value = 3;
    expect(bloomEffect.intensity.value).to.equal(1.5);

    // Texture parameter shares the same texture reference without touching its refCount.
    expect(cloneBloom.dirtTexture).to.not.equal(bloomEffect.dirtTexture);
    expect(cloneBloom.dirtTexture.value).to.equal(dirtTexture);
    expect(dirtTexture.refCount).to.equal(refCount);

    cloneEntity.destroy();
  });

  it("Post Process", () => {
    const ppManager = scene.postProcessManager;

    // @ts-ignore
    const activePostProcesses = ppManager._activePostProcesses;

    expect(activePostProcesses.length).to.equal(0);

    const pp1 = postEntity.addComponent(PostProcess);
    const pp2 = postEntity.addComponent(PostProcess);
    pp1.addEffect(BloomEffect);

    expect(pp1.priority).to.equal(0);
    expect(activePostProcesses.length).to.equal(2);
    expect(activePostProcesses[1] === pp2).to.true;

    // Test priority
    pp1.priority = 10;
    engine.update();
    expect(activePostProcesses[1] === pp1).to.true;

    pp1.enabled = false;
    expect(activePostProcesses.length).to.equal(1);

    pp1.enabled = true;
    expect(activePostProcesses.length).to.equal(2);
  });

  it("Custom effect", () => {
    const pp = postEntity.addComponent(PostProcess);
    const customEffect = pp.addEffect(CustomEffect);

    expect(customEffect).to.instanceOf(CustomEffect);
    expect(customEffect.intensity.value).to.equal(0);

    // Clamp
    customEffect.intensity.value = 2;
    expect(customEffect.intensity.value).to.equal(1);

    customEffect.intensity.value = -2;
    expect(customEffect.intensity.value).to.equal(0);

    // isValid
    expect(customEffect.isValid()).to.true;
    customEffect.enabled = false;
    expect(customEffect.isValid()).to.false;
  });

  it("Post process effect parameter", () => {
    {
      const p1 = new PostProcessEffectFloatParameter(1);
      const p2 = new PostProcessEffectFloatParameter(2, 0, 1);
      const p3 = new PostProcessEffectFloatParameter(-2, 0, 1);
      const p4 = new PostProcessEffectFloatParameter(10, 0);
      const p5 = new PostProcessEffectFloatParameter(-10, 0);
      const p6 = new PostProcessEffectFloatParameter(0.5, 0, 1, true);

      expect(p1.value).to.equal(1);
      expect(p2.value).to.equal(1);
      expect(p3.value).to.equal(0);
      expect(p4.value).to.equal(10);
      expect(p5.value).to.equal(0);
      expect(p6.value).to.equal(0.5);
    }

    {
      const p1 = new PostProcessEffectBoolParameter(false);
      const p2 = new PostProcessEffectBoolParameter(true);
      const p3 = new PostProcessEffectBoolParameter(true);

      expect(p1.value).to.equal(false);
      expect(p2.value).to.equal(true);
      expect(p3.value).to.equal(true);
    }
  });

  it("Global mode", () => {
    const ppManager = scene.postProcessManager;
    const pp1 = postEntity.addComponent(PostProcess);
    const pp2 = postEntity.addComponent(PostProcess);
    const bloom1 = pp1.addEffect(BloomEffect);
    const bloom2 = pp2.addEffect(BloomEffect);

    engine.update();

    const bloomBlend = ppManager.getBlendEffect(BloomEffect);
    expect(bloomBlend).to.instanceOf(BloomEffect);
    expect(bloomBlend.intensity.value).to.equal(0);

    bloom2.intensity.value = 10;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(10);

    pp1.priority = 10;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(0);

    pp1.enabled = false;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(10);

    pp1.enabled = true;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(0);

    pp2.priority = 20;
    engine.update();
    expect(bloomBlend.intensity.value).to.equal(10);
  });

  it("Local mode", async () => {
    const pp1 = postEntity.addComponent(PostProcess);
    expect(pp1.blendDistance).to.equal(0);
    expect(pp1.isGlobal).to.equal(true);

    pp1.isGlobal = false;
    // Only support local PostProcess in physics enabled Scenes.
    expect(pp1.isGlobal).to.equal(true);

    {
      const engine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: createPhysics()
      });
      const scene = engine.sceneManager.scenes[0];
      const passes = engine.postProcessPasses;
      const ppManager = scene.postProcessManager;
      uberPass = passes[0];
      const cameraEntity = scene.createRootEntity("camera");
      const camera = cameraEntity.addComponent(Camera);
      camera.enablePostProcess = true;
      const postEntity = scene.createRootEntity("post-process");

      const pp1 = postEntity.addComponent(PostProcess);
      const pp2 = postEntity.addComponent(PostProcess);
      const bloom1 = pp1.addEffect(BloomEffect);
      const bloom2 = pp2.addEffect(BloomEffect);
      const intensity2 = 10;

      pp2.priority = 10;
      bloom2.intensity.value = intensity2;

      engine.update();
      const bloomBlend = ppManager.getBlendEffect(BloomEffect);

      expect(bloomBlend.intensity.value).to.equal(10);

      // Local mode
      const radius = 5;
      pp2.isGlobal = false;
      pp2.blendDistance = radius;
      const collider = postEntity.addComponent(StaticCollider);
      const physicsBox = new SphereColliderShape();
      physicsBox.radius = radius;
      collider.addShape(physicsBox);

      // Inside
      cameraEntity.transform.position.set(radius / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(intensity2);

      // Edge
      cameraEntity.transform.position.set(radius, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(intensity2);

      // Outer half in blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(intensity2 / 2);

      // Outside over blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(0);

      // Blend with local and global
      const intensity1 = 1;
      bloom1.intensity.value = intensity1;

      // Inside
      cameraEntity.transform.position.set(radius / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 1));

      // Edge
      cameraEntity.transform.position.set(radius, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 1));

      // Outer half in blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance / 2, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 0.5));

      // Outside over blend distance
      cameraEntity.transform.position.set(radius + pp2.blendDistance, 0, 0);
      engine.update();
      expect(bloomBlend.intensity.value).to.equal(MathUtil.lerp(intensity1, intensity2, 0));

      engine.destroy();
    }
  });

  it("Bloom single-pass pyramid passes, mip RT lifecycle, and maxIterations", async () => {
    const htmlCanvas = document.createElement("canvas");
    htmlCanvas.width = 512;
    htmlCanvas.height = 512;
    const bloomEngine = await WebGLEngine.create({ canvas: htmlCanvas });
    const bloomScene = bloomEngine.sceneManager.scenes[0];
    const bloomCamera = bloomScene.createRootEntity("camera").addComponent(Camera);
    bloomCamera.enablePostProcess = true;

    const pp = bloomScene.createRootEntity("post-process").addComponent(PostProcess);
    pp.addEffect(TonemappingEffect);
    const bloomEffect = pp.addEffect(BloomEffect);
    bloomEffect.intensity.value = 1;
    bloomEffect.downScale.value = BloomDownScaleMode.Half;
    bloomEffect.maxIterations.value = 6;

    const activeUberPass = bloomEngine.postProcessPasses[0];
    const blitSpy = vi.spyOn(Blitter, "blitTexture");
    try {
      // @ts-ignore
      const bloomMaterial = activeUberPass._bloomMaterial;
      // @ts-ignore
      const uberMaterial = activeUberPass._uberMaterial;

      const countBloomBlits = () => blitSpy.mock.calls.filter((args) => args[5] === bloomMaterial).length;

      // 512x512 -> Half (256x256) -> 6 iterations -> 2*6 - 1 = 11 bloom passes, 6 mip RTs
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).to.equal(11);
      // @ts-ignore
      expect(activeUberPass._mipRT.length).to.equal(6);
      expect(uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).to.equal(
        // @ts-ignore
        activeUberPass._mipRT[0].getColorTexture(0)
      );

      // Shrinking maxIterations to 3 releases excess mip RTs and runs 2*3 - 1 = 5 bloom passes
      bloomEffect.maxIterations.value = 3;
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).to.equal(5);
      // @ts-ignore
      expect(activeUberPass._mipRT.length).to.equal(3);

      // Single iteration (mipCount = 1) runs only prefilter (1 pass) and binds mipRT[0]
      bloomEffect.maxIterations.value = 1;
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).to.equal(1);
      // @ts-ignore
      expect(activeUberPass._mipRT.length).to.equal(1);
      expect(uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).to.equal(
        // @ts-ignore
        activeUberPass._mipRT[0].getColorTexture(0)
      );

      // NaN maxIterations falls back safely to default 6 iterations (11 passes, 6 mip RTs)
      bloomEffect.maxIterations.value = Number.NaN;
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).to.equal(11);
      // @ts-ignore
      expect(activeUberPass._mipRT.length).to.equal(6);

      // Disabling bloom releases all mip RTs and clears the uber bloom texture binding
      bloomEffect.enabled = false;
      bloomEngine.update();
      // @ts-ignore
      expect(activeUberPass._mipRT.length).to.equal(0);
      expect(uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).to.be.null;
    } finally {
      blitSpy.mockRestore();
      bloomEngine.destroy();
    }
  });

  it("Bloom highQualityFiltering (BLOOM_HQ) bicubic in-place upsample renders cleanly", async () => {
    const size = 128;
    const htmlCanvas = document.createElement("canvas");
    htmlCanvas.width = size;
    htmlCanvas.height = size;
    const bloomEngine = await WebGLEngine.create({ canvas: htmlCanvas });
    const bloomScene = bloomEngine.sceneManager.scenes[0];
    bloomScene.background.solidColor.set(0, 0, 0, 1);

    const cameraEntity = bloomScene.createRootEntity("camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    const bloomCamera = cameraEntity.addComponent(Camera);
    bloomCamera.isOrthographic = true;
    bloomCamera.orthographicSize = size / 2;
    bloomCamera.enablePostProcess = true;
    bloomCamera.enableHDR = true;

    const destColorTexture = new Texture2D(bloomEngine, size, size, TextureFormat.R8G8B8A8_UNorm, false, false);
    const destTarget = new RenderTarget(bloomEngine, size, size, destColorTexture);
    bloomCamera.renderTarget = destTarget;

    // Centered 4x4 bright square in 1:1 pixel orthographic space
    const dotEntity = bloomScene.createRootEntity("impulse");
    const renderer = dotEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(bloomEngine, 4, 4, 1);
    const material = new UnlitMaterial(bloomEngine);
    material.baseColor.set(4, 4, 4, 1);
    renderer.setMaterial(material);

    const pp = bloomScene.createRootEntity("post-process").addComponent(PostProcess);
    const bloomEffect = pp.addEffect(BloomEffect);
    bloomEffect.highQualityFiltering.value = true;
    bloomEffect.downScale.value = BloomDownScaleMode.Half;
    bloomEffect.maxIterations.value = 4;
    bloomEffect.threshold.value = 0;
    bloomEffect.scatter.value = 0.7;
    bloomEffect.intensity.value = 1;

    try {
      const gl = (bloomEngine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
      const activeUberPass = bloomEngine.postProcessPasses[0];
      // @ts-ignore
      const bloomMaterial = activeUberPass._bloomMaterial;
      // @ts-ignore
      const uberMaterial = activeUberPass._uberMaterial;

      const hasHQMacro = (shaderData: any) =>
        shaderData.getMacros().some((m: { name: string }) => m.name === "BLOOM_HQ");

      while (gl.getError() !== gl.NO_ERROR);
      bloomEngine.update();
      expect(gl.getError()).to.equal(gl.NO_ERROR);
      expect(hasHQMacro(bloomMaterial.shaderData)).to.be.true;
      expect(hasHQMacro(uberMaterial.shaderData)).to.be.true;
      // @ts-ignore
      expect(activeUberPass._mipRT.length).to.equal(4);
      const bloomTexelSize = uberMaterial.shaderData.getVector4(BloomEffect._bloomTexelSizeProp);
      expect(bloomTexelSize.x).to.be.closeTo(1 / 64, 1e-6);
      expect(bloomTexelSize.y).to.be.closeTo(1 / 64, 1e-6);
      expect(bloomTexelSize.z).to.equal(64);
      expect(bloomTexelSize.w).to.equal(64);

      const outPixels = new Uint8Array(size * size * 4);
      destColorTexture.getPixelBuffer(outPixels);
      const readRed = (x: number, y: number) => outPixels[(y * size + x) * 4];
      const center = readRed(64, 64);
      const halo = readRed(70, 64);
      const corner = readRed(0, 0);
      expect(center).to.be.greaterThan(200);
      expect(halo).to.be.greaterThan(0);
      expect(center).to.be.greaterThan(halo);
      expect(halo).to.be.greaterThan(corner);

      // Switching to Quarter updates material_BloomTexelSize to mip0 (32x32)
      bloomEffect.downScale.value = BloomDownScaleMode.Quarter;
      while (gl.getError() !== gl.NO_ERROR);
      bloomEngine.update();
      expect(gl.getError()).to.equal(gl.NO_ERROR);
      expect(bloomTexelSize.x).to.be.closeTo(1 / 32, 1e-6);
      expect(bloomTexelSize.y).to.be.closeTo(1 / 32, 1e-6);
      expect(bloomTexelSize.z).to.equal(32);
      expect(bloomTexelSize.w).to.equal(32);

      // Disabling HQ filtering cleanly clears the BLOOM_HQ macro with no GL error
      bloomEffect.highQualityFiltering.value = false;
      while (gl.getError() !== gl.NO_ERROR);
      bloomEngine.update();
      expect(gl.getError()).to.equal(gl.NO_ERROR);
      expect(hasHQMacro(bloomMaterial.shaderData)).to.be.false;
      expect(hasHQMacro(uberMaterial.shaderData)).to.be.false;
    } finally {
      bloomCamera.renderTarget = null;
      destTarget.destroy(true);
      bloomEngine.destroy();
    }
  });

  it("Bloom impulse response peaks at center and decays monotonically outward", async () => {
    const size = 128;
    const htmlCanvas = document.createElement("canvas");
    htmlCanvas.width = size;
    htmlCanvas.height = size;
    const bloomEngine = await WebGLEngine.create({ canvas: htmlCanvas });
    const bloomScene = bloomEngine.sceneManager.scenes[0];
    bloomScene.background.solidColor.set(0, 0, 0, 1);

    const cameraEntity = bloomScene.createRootEntity("camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    const bloomCamera = cameraEntity.addComponent(Camera);
    bloomCamera.isOrthographic = true;
    bloomCamera.orthographicSize = size / 2;
    bloomCamera.enablePostProcess = true;
    // Use LDR RGBA8 mip chain so mipRT[0] can be read back directly for pure pyramid impulse checks
    bloomCamera.enableHDR = false;

    const destColorTexture = new Texture2D(bloomEngine, size, size, TextureFormat.R8G8B8A8_UNorm, false, false);
    const destTarget = new RenderTarget(bloomEngine, size, size, destColorTexture);
    bloomCamera.renderTarget = destTarget;

    // Centered 4x4 bright impulse -> symmetric 2x2 in mip0 (64x64) -> 1x1 texel in mip1 (32x32)
    const dotEntity = bloomScene.createRootEntity("impulse");
    const renderer = dotEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(bloomEngine, 4, 4, 1);
    const material = new UnlitMaterial(bloomEngine);
    material.baseColor.set(1, 1, 1, 1);
    renderer.setMaterial(material);

    const pp = bloomScene.createRootEntity("post-process").addComponent(PostProcess);
    const bloomEffect = pp.addEffect(BloomEffect);
    bloomEffect.downScale.value = BloomDownScaleMode.Half;
    bloomEffect.maxIterations.value = 3;
    bloomEffect.threshold.value = 0;
    // scatter = 1.0 isolates pure upsampled pyramid output (no unblurred highMip peak masking hollow rings)
    bloomEffect.scatter.value = 1;
    bloomEffect.intensity.value = 1;

    try {
      const gl = (bloomEngine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
      const activeUberPass = bloomEngine.postProcessPasses[0];

      for (const highQuality of [false, true]) {
        bloomEffect.highQualityFiltering.value = highQuality;
        while (gl.getError() !== gl.NO_ERROR);
        bloomEngine.update();
        expect(gl.getError()).to.equal(gl.NO_ERROR);

        // @ts-ignore
        const mip0RT: RenderTarget = activeUberPass._mipRT[0];
        const mip0Tex = mip0RT.getColorTexture(0) as Texture2D;
        const mipW = mip0RT.width;
        const mipH = mip0RT.height;
        const mipPixels = new Uint8Array(mipW * mipH * 4);
        mip0Tex.getPixelBuffer(mipPixels);

        const readMipR = (x: number, y: number) => mipPixels[(y * mipW + x) * 4];
        const readMipA = (x: number, y: number) => mipPixels[(y * mipW + x) * 4 + 3];

        // Symmetric center of 64x64 mip0 for the centered 4x4 impulse is (31..32, 31..32)
        const cx = mipW >> 1;
        const cy = mipH >> 1;
        const centerVal = readMipR(cx, cy);
        expect(centerVal).to.be.greaterThan(20);
        // Hardware BlendState must preserve dst.a = 0.0
        expect(readMipA(cx, cy)).to.equal(0);

        // Peak must be at center (no hollow-ring / ringing outer lobe brighter than center)
        let globalMax = 0;
        for (let i = 0; i < mipW * mipH; i++) {
          if (mipPixels[i * 4] > globalMax) {
            globalMax = mipPixels[i * 4];
          }
        }
        expect(centerVal).to.equal(globalMax);

        // Monotonically non-increasing outward along both +X axis and +X/+Y diagonal
        let prevAxis = centerVal;
        for (let r = 1; r <= 12; r++) {
          const val = readMipR(cx + r, cy);
          expect(val).to.be.at.most(prevAxis);
          prevAxis = val;
        }
        expect(prevAxis).to.be.lessThan(centerVal);

        let prevDiag = centerVal;
        for (let r = 1; r <= 10; r++) {
          const val = readMipR(cx + r, cy + r);
          expect(val).to.be.at.most(prevDiag);
          prevDiag = val;
        }
        expect(prevDiag).to.be.lessThan(centerVal);
      }
    } finally {
      bloomCamera.renderTarget = null;
      destTarget.destroy(true);
      bloomEngine.destroy();
    }
  });

  it("Bloom Quarter prefilter covers all 4x4 source pixels without blind spots", async () => {
    const size = 128;
    const htmlCanvas = document.createElement("canvas");
    htmlCanvas.width = size;
    htmlCanvas.height = size;
    const bloomEngine = await WebGLEngine.create({ canvas: htmlCanvas });
    const bloomScene = bloomEngine.sceneManager.scenes[0];
    bloomScene.background.solidColor.set(0, 0, 0, 1);

    const cameraEntity = bloomScene.createRootEntity("camera");
    cameraEntity.transform.setPosition(0, 0, 10);
    const bloomCamera = cameraEntity.addComponent(Camera);
    bloomCamera.isOrthographic = true;
    bloomCamera.orthographicSize = size / 2;
    bloomCamera.enablePostProcess = true;
    bloomCamera.enableHDR = false;

    const destColorTexture = new Texture2D(bloomEngine, size, size, TextureFormat.R8G8B8A8_UNorm, false, false);
    const destTarget = new RenderTarget(bloomEngine, size, size, destColorTexture);
    bloomCamera.renderTarget = destTarget;

    // 1x1 bright pixel shifted across corner and inner positions of the same 4x4 Quarter cell
    const dotEntity = bloomScene.createRootEntity("dot");
    const renderer = dotEntity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(bloomEngine, 1, 1, 1);
    const material = new UnlitMaterial(bloomEngine);
    material.baseColor.set(1, 1, 1, 1);
    renderer.setMaterial(material);

    const pp = bloomScene.createRootEntity("post-process").addComponent(PostProcess);
    const bloomEffect = pp.addEffect(BloomEffect);
    bloomEffect.downScale.value = BloomDownScaleMode.Quarter;
    bloomEffect.maxIterations.value = 1;
    bloomEffect.threshold.value = 0;
    bloomEffect.intensity.value = 1;

    try {
      const gl = (bloomEngine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
      const activeUberPass = bloomEngine.postProcessPasses[0];

      const readMaxMip0Red = () => {
        while (gl.getError() !== gl.NO_ERROR);
        bloomEngine.update();
        expect(gl.getError()).to.equal(gl.NO_ERROR);
        // @ts-ignore
        const mip0RT: RenderTarget = activeUberPass._mipRT[0];
        const mip0Tex = mip0RT.getColorTexture(0) as Texture2D;
        const pixels = new Uint8Array(mip0RT.width * mip0RT.height * 4);
        mip0Tex.getPixelBuffer(pixels);
        let maxR = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > maxR) maxR = pixels[i];
        }
        return maxR;
      };

      // Default Quarter 4-tap box: corner (-3.5, -3.5) and inner (-2.5, -2.5) of the same 4x4 cell must both be captured equally
      bloomEffect.highQualityFiltering.value = false;
      dotEntity.transform.setPosition(-3.5, -3.5, 0);
      const cornerVal = readMaxMip0Red();
      dotEntity.transform.setPosition(-2.5, -2.5, 0);
      const innerVal = readMaxMip0Red();
      expect(cornerVal).to.be.greaterThan(0);
      expect(cornerVal).to.equal(innerVal);

      // HQ Quarter 13-tap (step * 2): corner and inner positions must both be captured cleanly
      bloomEffect.highQualityFiltering.value = true;
      dotEntity.transform.setPosition(-3.5, -3.5, 0);
      const hqCornerVal = readMaxMip0Red();
      dotEntity.transform.setPosition(-2.5, -2.5, 0);
      const hqInnerVal = readMaxMip0Red();
      expect(hqCornerVal).to.be.greaterThan(0);
      expect(hqInnerVal).to.be.greaterThan(0);
    } finally {
      bloomCamera.renderTarget = null;
      destTarget.destroy(true);
      bloomEngine.destroy();
    }
  });
});
