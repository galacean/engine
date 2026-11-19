import {
  GLCapabilityType,
  RenderTarget,
  Texture2D,
  Texture2DArray,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let engine: WebGLEngine;
let gl: WebGL2RenderingContext;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  engine = await WebGLEngine.create({ canvas });
  gl = canvas.getContext("webgl2")!;
});
afterAll(() => engine.destroy());

const SAMPLE_VALUES = [-2.75, -1, -0.5, 0, 0.25, 0.5, 1, 1.5, 2, 3, 4, 6];
const SAMPLE_HALF_BITS = [
  0xc180, 0xbc00, 0xb800, 0x0000, 0x3400, 0x3800, 0x3c00, 0x3e00, 0x4000, 0x4200, 0x4400, 0x4600
];

it.each([
  [TextureFormat.R16_SFloat, 1, true, 2],
  [TextureFormat.R16G16_SFloat, 2, true, 4],
  [TextureFormat.R32_SFloat, 1, false, 4],
  [TextureFormat.R32G32_SFloat, 2, false, 8]
] as const)(
  "round trips float format %s with odd-width uploads, memory size, and array/cube readbacks",
  (format, channels, half, bytesPerTexel) => {
    const count = 6 * channels;
    const expected = SAMPLE_VALUES.slice(0, count);
    const input = half ? new Uint16Array(SAMPLE_HALF_BITS.slice(0, count)) : new Float32Array(expected);

    const texture = new Texture2D(engine, 3, 2, format, false, false);
    expect(texture._memorySize).toBe(6 * bytesPerTexel);
    texture.setPixelBuffer(input);
    const out = new Float32Array(24);
    texture.getPixelBuffer(out);
    for (let i = 0; i < 6; i++) {
      for (let c = 0; c < channels; c++) {
        expect(out[i * 4 + c]).toBe(expected[i * channels + c]);
      }
    }

    const renderTarget = new RenderTarget(engine, 3, 2, texture, null);
    expect(renderTarget.getColorTexture(0)).toBe(texture);
    renderTarget.destroy();

    const array = new Texture2DArray(engine, 3, 2, 2, format, false, false);
    expect(array._memorySize).toBe(12 * bytesPerTexel);
    array.setPixelBuffer(1, input, 0, 0, 0, 3, 2, 1);
    for (const read of [
      () => array.getPixelBuffer(1, out),
      () => array.getPixelBuffer(1, 0, out),
      () => array.getPixelBuffer(1, 0, 0, 3, 2, out),
      () => array.getPixelBuffer(1, 0, 0, 3, 2, 0, out)
    ]) {
      out.fill(0);
      read();
      for (let i = 0; i < 6; i++) {
        for (let c = 0; c < channels; c++) {
          expect(out[i * 4 + c]).toBe(expected[i * channels + c]);
        }
      }
    }

    const cube = new TextureCube(engine, 1, format, false, false);
    cube.setPixelBuffer(TextureCubeFace.PositiveX, input.subarray(0, channels));
    out.fill(0);
    cube.getPixelBuffer(TextureCubeFace.PositiveX, out);
    for (let c = 0; c < channels; c++) {
      expect(out[c]).toBe(expected[c]);
    }

    expect(gl.getError()).toBe(gl.NO_ERROR);
    texture.destroy(true);
    array.destroy(true);
    cube.destroy(true);
  }
);

it("round trips R16 unsigned normalized texels at an odd row width", () => {
  if (!gl.getExtension("EXT_texture_norm16")) {
    expect(() => new Texture2D(engine, 3, 2, TextureFormat.R16, false, false)).toThrow();
    return;
  }
  const texture = new Texture2D(engine, 3, 2, TextureFormat.R16, false, false);
  expect(texture._memorySize).toBe(12);
  const heights = new Uint16Array([0, 1, 255, 256, 32768, 65535]);
  texture.setPixelBuffer(heights);
  const pixels = new Uint16Array(heights.length * 4);
  texture.getPixelBuffer(pixels);
  expect(pixels.filter((_, index) => index % 4 === 0)).toEqual(heights);
  expect(gl.getError()).toBe(gl.NO_ERROR);
  texture.destroy();
});

it("falls back to Point filtering for 32-bit float formats when OES_texture_float_linear is unavailable", () => {
  const rhi = engine._hardwareRenderer;
  const origCanIUse = rhi.canIUse.bind(rhi);
  const spy = vi.spyOn(rhi, "canIUse").mockImplementation((cap) => {
    if (cap === GLCapabilityType.textureFloatLinear) return false;
    return origCanIUse(cap);
  });

  try {
    for (const format of [TextureFormat.R32_SFloat, TextureFormat.R32G32_SFloat, TextureFormat.R32G32B32A32_SFloat]) {
      const texture = new Texture2D(engine, 4, 4, format, true, false);
      expect(texture.filterMode).toBe(TextureFilterMode.Point);
      texture.filterMode = TextureFilterMode.Trilinear;
      expect(texture.filterMode).toBe(TextureFilterMode.Point);
      texture.generateMipmaps();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      texture.destroy(true);
    }
  } finally {
    spy.mockRestore();
  }
});

it("throws on float readback and skips mipmap generation when color-renderable support is unavailable", () => {
  const rhi = engine._hardwareRenderer;
  const spy = vi.spyOn(rhi, "supportsRenderTargetColorFormat").mockReturnValue(false);

  try {
    const out = new Float32Array(16);
    for (const format of [
      TextureFormat.R16_SFloat,
      TextureFormat.R16G16_SFloat,
      TextureFormat.R32_SFloat,
      TextureFormat.R32G32_SFloat,
      TextureFormat.R32G32B32A32_SFloat
    ]) {
      const texture = new Texture2D(engine, 2, 2, format, true, false);
      expect(() => texture.getPixelBuffer(out)).toThrow(/color-renderable/);
      texture.generateMipmaps();
      expect(gl.getError()).toBe(gl.NO_ERROR);
      texture.destroy(true);
    }
  } finally {
    spy.mockRestore();
  }
});
