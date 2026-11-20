import { describe, expect, it, vi } from "vitest";
import {
  Blitter,
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Color,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  RenderTarget,
  Texture2D,
  TextureFormat,
  TonemappingEffect,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";

describe("Bloom single-pass 13-tap downsample and in-place upsample", () => {
  it("clamps maxIterations and clones BloomEffect parameters", async () => {
    const htmlCanvas = document.createElement("canvas");
    htmlCanvas.width = 64;
    htmlCanvas.height = 64;
    const engine = await WebGLEngine.create({ canvas: htmlCanvas });
    try {
      const scene = engine.sceneManager.activeScene;
      const pp = scene.createRootEntity("post-process").addComponent(PostProcess);
      const bloomEffect = pp.addEffect(BloomEffect);

      expect(bloomEffect.maxIterations.value).toBe(6);
      bloomEffect.maxIterations.value = 0;
      expect(bloomEffect.maxIterations.value).toBe(1);
      bloomEffect.maxIterations.value = 16;
      expect(bloomEffect.maxIterations.value).toBe(8);
      bloomEffect.maxIterations.value = 4;

      bloomEffect.intensity.value = 1.5;
      bloomEffect.threshold.value = 0.9;
      bloomEffect.tint.value = new Color(0.5, 0.25, 0.1, 1);
      bloomEffect.highQualityFiltering.value = true;
      bloomEffect.enabled = false;

      const cloneEntity = pp.entity.clone();
      const cloneBloom = cloneEntity.getComponent(PostProcess)!.getEffect(BloomEffect)!;
      expect(cloneBloom.maxIterations.value).toBe(4);
      expect(cloneBloom.intensity.value).toBe(1.5);
      expect(cloneBloom.threshold.value).toBe(0.9);
      expect(cloneBloom.highQualityFiltering.value).toBe(true);
      expect(cloneBloom.enabled).toBe(false);
    } finally {
      engine.destroy();
    }
  });

  it("runs 2N-1 bloom passes with single mip RT pyramid, maxIterations resizing, and clean disable", async () => {
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

    const activeUberPass = bloomEngine.postProcessPasses[0] as any;
    const blitSpy = vi.spyOn(Blitter, "blitTexture");
    try {
      const bloomMaterial = activeUberPass._bloomMaterial;
      const uberMaterial = activeUberPass._uberMaterial;
      const countBloomBlits = () => blitSpy.mock.calls.filter((args) => args[5] === bloomMaterial).length;

      // 512x512 -> Half (256x256) -> 6 iterations -> 2*6 - 1 = 11 bloom passes, 6 mip RTs
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).toBe(11);
      expect(activeUberPass._mipRT.length).toBe(6);
      expect(uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).toBe(
        activeUberPass._mipRT[0].getColorTexture(0)
      );

      // Shrinking maxIterations to 3 releases excess mip RTs and runs 2*3 - 1 = 5 bloom passes
      bloomEffect.maxIterations.value = 3;
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).toBe(5);
      expect(activeUberPass._mipRT.length).toBe(3);

      // Single iteration (mipCount = 1) runs only prefilter (1 pass) and binds mipRT[0]
      bloomEffect.maxIterations.value = 1;
      blitSpy.mockClear();
      bloomEngine.update();
      expect(countBloomBlits()).toBe(1);
      expect(activeUberPass._mipRT.length).toBe(1);
      expect(uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).toBe(
        activeUberPass._mipRT[0].getColorTexture(0)
      );

      // Disabling bloom releases all mip RTs and clears the uber bloom texture binding
      bloomEffect.enabled = false;
      bloomEngine.update();
      expect(activeUberPass._mipRT.length).toBe(0);
      expect(uberMaterial.shaderData.getTexture(BloomEffect._bloomTextureProp)).toBeNull();
    } finally {
      blitSpy.mockRestore();
      bloomEngine.destroy();
    }
  });

  it("renders BLOOM_HQ bicubic in-place upsample cleanly with no GL error", async () => {
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

    const destColorTexture = new Texture2D(bloomEngine, size, size, TextureFormat.R8G8B8A8, false, false);
    const destTarget = new RenderTarget(bloomEngine, size, size, destColorTexture);
    bloomCamera.renderTarget = destTarget;

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
      const activeUberPass = bloomEngine.postProcessPasses[0] as any;
      const bloomMaterial = activeUberPass._bloomMaterial;
      const uberMaterial = activeUberPass._uberMaterial;
      const hasHQMacro = (shaderData: any) =>
        shaderData.getMacros().some((m: { name: string }) => m.name === "BLOOM_HQ");

      while (gl.getError() !== gl.NO_ERROR);
      bloomEngine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      expect(hasHQMacro(bloomMaterial.shaderData)).toBe(true);
      expect(hasHQMacro(uberMaterial.shaderData)).toBe(true);
      expect(activeUberPass._mipRT.length).toBe(4);

      const outPixels = new Uint8Array(size * size * 4);
      destColorTexture.getPixelBuffer(outPixels);
      const readRed = (x: number, y: number) => outPixels[(y * size + x) * 4];
      const center = readRed(64, 64);
      const halo = readRed(70, 64);
      const corner = readRed(0, 0);
      expect(center).toBeGreaterThan(200);
      expect(halo).toBeGreaterThan(0);
      expect(center).toBeGreaterThan(halo);
      expect(halo).toBeGreaterThan(corner);

      bloomEffect.highQualityFiltering.value = false;
      while (gl.getError() !== gl.NO_ERROR);
      bloomEngine.update();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      expect(hasHQMacro(bloomMaterial.shaderData)).toBe(false);
      expect(hasHQMacro(uberMaterial.shaderData)).toBe(false);
    } finally {
      bloomCamera.renderTarget = null;
      destTarget.destroy(true);
      bloomEngine.destroy();
    }
  });

  it("impulse response peaks at center, preserves alpha 0, and decays monotonically outward", async () => {
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

    const destColorTexture = new Texture2D(bloomEngine, size, size, TextureFormat.R8G8B8A8, false, false);
    const destTarget = new RenderTarget(bloomEngine, size, size, destColorTexture);
    bloomCamera.renderTarget = destTarget;

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
    bloomEffect.scatter.value = 1;
    bloomEffect.intensity.value = 1;

    try {
      const gl = (bloomEngine as any)._hardwareRenderer._gl as WebGL2RenderingContext;
      const activeUberPass = bloomEngine.postProcessPasses[0] as any;

      for (const highQuality of [false, true]) {
        bloomEffect.highQualityFiltering.value = highQuality;
        while (gl.getError() !== gl.NO_ERROR);
        bloomEngine.update();
        expect(gl.getError()).toBe(gl.NO_ERROR);

        const mip0RT: RenderTarget = activeUberPass._mipRT[0];
        const mip0Tex = mip0RT.getColorTexture(0) as Texture2D;
        const mipW = mip0RT.width;
        const mipH = mip0RT.height;
        const mipPixels = new Uint8Array(mipW * mipH * 4);
        mip0Tex.getPixelBuffer(mipPixels);

        const readMipR = (x: number, y: number) => mipPixels[(y * mipW + x) * 4];
        const readMipA = (x: number, y: number) => mipPixels[(y * mipW + x) * 4 + 3];

        const cx = mipW >> 1;
        const cy = mipH >> 1;
        const centerVal = readMipR(cx, cy);
        expect(centerVal).toBeGreaterThan(20);
        expect(readMipA(cx, cy)).toBe(0);

        let globalMax = 0;
        for (let i = 0; i < mipW * mipH; i++) {
          if (mipPixels[i * 4] > globalMax) globalMax = mipPixels[i * 4];
        }
        expect(centerVal).toBe(globalMax);

        let prevAxis = centerVal;
        for (let r = 1; r <= 12; r++) {
          const val = readMipR(cx + r, cy);
          expect(val).toBeLessThanOrEqual(prevAxis);
          prevAxis = val;
        }
        expect(prevAxis).toBeLessThan(centerVal);

        let prevDiag = centerVal;
        for (let r = 1; r <= 10; r++) {
          const val = readMipR(cx + r, cy + r);
          expect(val).toBeLessThanOrEqual(prevDiag);
          prevDiag = val;
        }
        expect(prevDiag).toBeLessThan(centerVal);
      }
    } finally {
      bloomCamera.renderTarget = null;
      destTarget.destroy(true);
      bloomEngine.destroy();
    }
  });
});
