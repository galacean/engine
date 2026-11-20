import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  Matrix,
  MSAASamples,
  PostProcess,
  RenderTarget,
  Scene,
  Texture2D,
  TextureFormat,
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

  it("exposes expected parameter defaults, clamping, and white-balance matrix parity", () => {
    const effect = new ColorAdjustmentsEffect();
    expect(effect.isValid()).toBe(true);
    expect(effect.postExposure.value).toBe(0);
    expect(effect.temperature.value).toBe(0);
    expect(effect.tint.value).toBe(0);
    expect(effect.contrast.value).toBe(0);
    expect(effect.saturation.value).toBe(0);

    effect.postExposure.value = 20;
    expect(effect.postExposure.value).toBe(10);
    effect.saturation.value = -200;
    expect(effect.saturation.value).toBe(-100);

    effect.enabled = false;
    expect(effect.isValid()).toBe(false);

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

  it("applies postExposure, white balance, contrast, and saturation in the Uber pass", () => {
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

    // Baseline neutral grading matches disabled grading
    grading.enabled = false;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const disabledBase = readCenterPixel(pixels);

    grading.enabled = true;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const base = readCenterPixel(pixels);
    expect(Math.abs(base[0] - disabledBase[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(base[1] - disabledBase[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(base[2] - disabledBase[2])).toBeLessThanOrEqual(1);

    // +1 EV exposure increases luminance
    grading.postExposure.value = 1;
    engine.update();
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

    // Contrast scales deviation around linear middle gray (0.18)
    scene.background.solidColor = new Color(0.4, 0.4, 0.4, 1);
    grading.contrast.value = 0;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const contrastZero = readCenterPixel(pixels)[0];
    grading.contrast.value = 80;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const contrastHigh = readCenterPixel(pixels)[0];
    expect(contrastHigh).toBeGreaterThan(contrastZero + 10);

    // Post-exposure feeds Bloom prefilter threshold
    grading.contrast.value = 0;
    scene.background.solidColor = new Color(0.6, 0.6, 0.6, 1);
    const bloom = post.addEffect(BloomEffect)!;
    bloom.downScale.value = BloomDownScaleMode.Quarter;
    bloom.threshold.value = 1.0;
    bloom.intensity.value = 1.0;

    grading.postExposure.value = 0;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const bloomBelowThreshold = readCenterPixel(pixels)[0];

    grading.postExposure.value = 1.5;
    engine.update();
    colorTex.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    const bloomAboveThreshold = readCenterPixel(pixels)[0];
    expect(bloomAboveThreshold).toBeGreaterThan(bloomBelowThreshold + 30);

    const gl = (engine as any)._hardwareRenderer.gl as WebGL2RenderingContext;
    expect(gl.getError()).toBe(gl.NO_ERROR);

    rt.destroy(true);
    scene.destroy();
  });
});
