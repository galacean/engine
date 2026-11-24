import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  Matrix,
  MeshRenderer,
  MSAASamples,
  PostProcess,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  Texture2D,
  TextureFormat,
  TonemappingEffect,
  TonemappingMode,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SIZE = 64;

function readCenterPixel(pixels: Uint8Array, size = SIZE): [number, number, number] {
  const cx = size >> 1;
  const cy = size >> 1;
  const idx = (cy * size + cx) * 4;
  return [pixels[idx], pixels[idx + 1], pixels[idx + 2]];
}

function applyWhiteBalanceReference(rgb: [number, number, number], wb: Vector3): [number, number, number] {
  const [r, g, b] = rgb;
  const l = (0.390405 * r + 0.549941 * g + 0.00892632 * b) * wb.x;
  const m = (0.0708416 * r + 0.963172 * g + 0.00135775 * b) * wb.y;
  const s = (0.0231082 * r + 0.128021 * g + 0.936245 * b) * wb.z;
  return [
    2.85847 * l - 1.62879 * m - 0.024891 * s,
    -0.210182 * l + 1.1582 * m + 0.000324281 * s,
    -0.041812 * l - 0.118169 * m + 1.06867 * s
  ];
}

describe("ColorAdjustmentsEffect", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    engine = await WebGLEngine.create({ canvas });
  });

  afterAll(() => {
    engine.destroy();
  });

  it("exposes expected defaults, active-state gating, clamping, and white-balance matrix parity", () => {
    const effect = new ColorAdjustmentsEffect();
    // All-zero defaults are a no-op so mobile skips extra post-process work
    expect(effect.isValid()).toBe(false);
    expect(effect.postExposure.value).toBe(0);
    expect(effect.temperature.value).toBe(0);
    expect(effect.tint.value).toBe(0);
    expect(effect.contrast.value).toBe(0);
    expect(effect.saturation.value).toBe(0);

    effect.postExposure.value = 20;
    expect(effect.postExposure.value).toBe(10);
    expect(effect.isValid()).toBe(true);

    effect.enabled = false;
    expect(effect.isValid()).toBe(false);
    effect.enabled = true;
    effect.postExposure.value = 0;
    expect(effect.isValid()).toBe(false);

    effect.saturation.value = -200;
    expect(effect.saturation.value).toBe(-100);
    expect(effect.isValid()).toBe(true);

    const neutral = ColorAdjustmentsEffect._computeWhiteBalance(0, 0, new Vector3());
    expect(neutral.x).toBeCloseTo(1, 3);
    expect(neutral.y).toBeCloseTo(1, 3);
    expect(neutral.z).toBeCloseTo(1, 3);

    const identityMat = ColorAdjustmentsEffect._computeWhiteBalanceMatrix(0, 0, new Matrix());
    expect(Array.from(identityMat.elements)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

    const warm = ColorAdjustmentsEffect._computeWhiteBalance(60, 0, new Vector3());
    const cool = ColorAdjustmentsEffect._computeWhiteBalance(-60, 0, new Vector3());
    expect(warm.x).toBeGreaterThan(warm.z);
    expect(cool.z).toBeGreaterThan(cool.x);

    // Verify pre-multiplied 3x3 matrix matches two-step linearToLMS -> scale -> lmsToLinear
    const sample: [number, number, number] = [0.42, 0.27, 0.13];
    for (const [temp, tint] of [
      [60, -25],
      [-55, 40],
      [0, 50]
    ] as const) {
      const wb = ColorAdjustmentsEffect._computeWhiteBalance(temp, tint, new Vector3());
      const mat = ColorAdjustmentsEffect._computeWhiteBalanceMatrix(temp, tint, new Matrix());
      const e = mat.elements;
      const matResult: [number, number, number] = [
        e[0] * sample[0] + e[4] * sample[1] + e[8] * sample[2],
        e[1] * sample[0] + e[5] * sample[1] + e[9] * sample[2],
        e[2] * sample[0] + e[6] * sample[1] + e[10] * sample[2]
      ];
      const refResult = applyWhiteBalanceReference(sample, wb);
      expect(matResult[0]).toBeCloseTo(refResult[0], 5);
      expect(matResult[1]).toBeCloseTo(refResult[1], 5);
      expect(matResult[2]).toBeCloseTo(refResult[2], 5);
    }
  });

  it("applies postExposure, white balance, LogC contrast, and saturation in the Uber pass", () => {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.25, 0.15, 0.08, 1);

    const camera = scene.createRootEntity("Camera").addComponent(Camera);
    camera.enableHDR = true;
    camera.enablePostProcess = true;
    camera.msaaSamples = MSAASamples.None;

    const colorTex = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8_UNorm, false, true);
    const rt = new RenderTarget(engine, SIZE, SIZE, colorTex, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    const post = scene.createRootEntity("Post").addComponent(PostProcess);
    post.isGlobal = true;
    const grading = post.addEffect(ColorAdjustmentsEffect)!;
    const pixels = new Uint8Array(SIZE * SIZE * 4);

    // Baseline with default (inactive) grading
    engine.update();
    expect((scene.postProcessManager as any)._isValid()).toBe(false);
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const base = readCenterPixel(pixels);
    expect(base[0]).toBeGreaterThan(base[1]);
    expect(base[1]).toBeGreaterThan(base[2]);

    // +1 EV exposure increases luminance
    grading.postExposure.value = 1;
    engine.update();
    expect((scene.postProcessManager as any)._isValid()).toBe(true);
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const exposed = readCenterPixel(pixels);
    expect(exposed[0]).toBeGreaterThan(base[0] + 20);
    grading.postExposure.value = 0;

    // Saturation = -100 produces monochrome grayscale
    grading.saturation.value = -100;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const mono = readCenterPixel(pixels);
    expect(Math.max(...mono) - Math.min(...mono)).toBeLessThanOrEqual(2);
    grading.saturation.value = 0;

    // Warm temperature boosts red relative to blue; cool does the reverse
    grading.temperature.value = 80;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const warm = readCenterPixel(pixels);
    grading.temperature.value = -80;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const cool = readCenterPixel(pixels);
    expect(warm[0] - warm[2]).toBeGreaterThan(cool[0] - cool[2] + 30);
    grading.temperature.value = 0;

    // LogC contrast preserves 18% middle gray while expanding highlights and preserving dark shadow detail
    scene.background.solidColor = new Color(0.18, 0.18, 0.18, 1);
    grading.contrast.value = 0;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const midGrayBase = readCenterPixel(pixels)[0];
    grading.contrast.value = 80;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const midGrayHighContrast = readCenterPixel(pixels)[0];
    expect(Math.abs(midGrayHighContrast - midGrayBase)).toBeLessThanOrEqual(1);

    // Shadow value 0.04 at +50 contrast must NOT clip to dead black (linear contrast would crush < 0.06 to 0)
    scene.background.solidColor = new Color(0.04, 0.04, 0.04, 1);
    grading.contrast.value = 50;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const shadowHighContrast = readCenterPixel(pixels)[0];
    expect(shadowHighContrast).toBeGreaterThan(15);

    // Highlight value 0.40 at +80 contrast brightens noticeably
    scene.background.solidColor = new Color(0.4, 0.4, 0.4, 1);
    grading.contrast.value = 0;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const highlightBase = readCenterPixel(pixels)[0];
    grading.contrast.value = 80;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const highlightBoosted = readCenterPixel(pixels)[0];
    expect(highlightBoosted).toBeGreaterThan(highlightBase + 10);

    // Pure black stays pure black under positive contrast (no NaN from log2)
    scene.background.solidColor = new Color(0, 0, 0, 1);
    grading.contrast.value = 50;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    expect(readCenterPixel(pixels)).toEqual([0, 0, 0]);
    grading.contrast.value = 0;

    // Post-exposure applies after Bloom composite in UberPost without coupling BloomPrefilter
    scene.background.solidColor = new Color(0.4, 0.4, 0.4, 1);
    const bloom = post.addEffect(BloomEffect)!;
    bloom.downScale.value = BloomDownScaleMode.Quarter;
    bloom.threshold.value = 0.2;
    bloom.intensity.value = 0.5;
    grading.postExposure.value = -1;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const darkExposed = readCenterPixel(pixels)[0];
    grading.postExposure.value = 1;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const brightExposed = readCenterPixel(pixels)[0];
    expect(brightExposed).toBeGreaterThan(darkExposed + 50);

    const gl = (engine as any)._hardwareRenderer.gl as WebGL2RenderingContext;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    rt.destroy(true);
    scene.destroy();
  });

  it("preserves premultiplied alpha, zero-alpha bloom, and high-EV HDR precision in a float RT", () => {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;

    const cameraEntity = scene.createRootEntity("Camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.isAlphaOutputRequired = true;
    camera.enablePostProcess = true;
    camera.msaaSamples = MSAASamples.None;
    cameraEntity.transform.setPosition(0, 0, 10);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));

    const colorTex = new Texture2D(engine, SIZE, SIZE, TextureFormat.R32G32B32A32_SFloat, false, false);
    const rt = new RenderTarget(engine, SIZE, SIZE, colorTex, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    const post = scene.createRootEntity("Post").addComponent(PostProcess);
    post.isGlobal = true;
    const grading = post.addEffect(ColorAdjustmentsEffect)!;
    const pixels = new Float32Array(SIZE * SIZE * 4);
    const readCenterFloat = (): [number, number, number, number] => {
      const cx = SIZE >> 1;
      const cy = SIZE >> 1;
      const idx = (cy * SIZE + cx) * 4;
      return [pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]];
    };

    // 1. Opaque 18% middle gray at +100 contrast remains ~0.18 (within fp16 internal HDR precision)
    scene.background.solidColor = new Color(0.18, 0.18, 0.18, 1);
    grading.contrast.value = 100;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const opaqueMid = readCenterFloat();
    expect(opaqueMid[0]).toBeCloseTo(0.18, 2);
    expect(opaqueMid[3]).toBeCloseTo(1, 3);

    // 2. Semi-transparent (alpha = 0.5) 18% middle gray at +100 contrast remains ~0.09 (not ~0.043)
    scene.background.solidColor = new Color(0.18, 0.18, 0.18, 0.5);
    grading.contrast.value = 100;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const semiMid = readCenterFloat();
    expect(semiMid[0]).toBeCloseTo(0.09, 2);
    expect(semiMid[1]).toBeCloseTo(0.09, 2);
    expect(semiMid[2]).toBeCloseTo(0.09, 2);
    expect(semiMid[3]).toBeCloseTo(0.5, 3);

    // 3. Fully transparent black (0, 0, 0, 0) at -100 contrast stays (0, 0, 0, 0) (not lifted to 0.18)
    scene.background.solidColor = new Color(0, 0, 0, 0);
    grading.contrast.value = -100;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const zeroAlpha = readCenterFloat();
    expect(zeroAlpha[0]).toBeCloseTo(0, 4);
    expect(zeroAlpha[1]).toBeCloseTo(0, 4);
    expect(zeroAlpha[2]).toBeCloseTo(0, 4);
    expect(zeroAlpha[3]).toBeCloseTo(0, 4);

    // 4. Additive Bloom in zero-alpha regions is preserved under -100 and +100 contrast
    const brightEntity = scene.createRootEntity("BrightCube");
    const brightRenderer = brightEntity.addComponent(MeshRenderer);
    brightRenderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
    const brightMat = new UnlitMaterial(engine);
    brightMat.baseColor = new Color(8, 6, 4, 1);
    brightRenderer.setMaterial(brightMat);

    const bloom = post.addEffect(BloomEffect)!;
    bloom.downScale.value = BloomDownScaleMode.Half;
    bloom.threshold.value = 0.8;
    bloom.intensity.value = 1.0;

    for (const contrastValue of [-100, 100]) {
      grading.contrast.value = contrastValue;
      engine.update();
      colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      let maxZeroAlphaBloom = 0;
      for (let i = 0; i < SIZE * SIZE; i++) {
        const a = pixels[i * 4 + 3];
        if (a < 1e-3) {
          maxZeroAlphaBloom = Math.max(maxZeroAlphaBloom, pixels[i * 4]);
        }
      }
      expect(maxZeroAlphaBloom).toBeGreaterThan(0.05);
    }

    brightEntity.destroy();
    brightMat.destroy();
    bloom.enabled = false;

    // 5. Extreme HDR (100.0) + +10 EV stays finite through white balance and ACES tonemapping
    scene.background.solidColor = new Color(100, 80, 60, 1);
    grading.contrast.value = 0;
    grading.postExposure.value = 10;
    grading.temperature.value = 25;
    post.addEffect(TonemappingEffect)!.mode.value = TonemappingMode.ACES;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const hdrPeak = readCenterFloat();
    expect(Number.isFinite(hdrPeak[0])).toBe(true);
    expect(Number.isFinite(hdrPeak[1])).toBe(true);
    expect(Number.isFinite(hdrPeak[2])).toBe(true);
    expect(hdrPeak[0]).toBeGreaterThan(0.95);

    const gl = (engine as any)._hardwareRenderer.gl as WebGL2RenderingContext;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    rt.destroy(true);
    scene.destroy();
  });
});
