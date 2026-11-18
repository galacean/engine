import { AssetType, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;
let gl: WebGL2RenderingContext;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  engine = await WebGLEngine.create({ canvas });
  gl = canvas.getContext("webgl2")!;
});
afterAll(() => engine.destroy());

it.each([
  ["R16F", TextureFormat.R16, 1, true],
  ["RG16F", TextureFormat.R16G16, 2, true],
  ["R32F", TextureFormat.R32, 1, false],
  ["RG32F", TextureFormat.R32G32, 2, false]
] as const)("loads editor-encoded %s and preserves every channel", async (name, format, channels, half) => {
  const url = new URL(`./fixtures/float-ktx2/editor-${name}.ktx2`, import.meta.url).href;
  const texture = await engine.resourceManager.load<Texture2D>({ url, type: AssetType.KTX2 });
  expect(texture.format).toBe(format);
  expect(texture.width).toBe(5);
  expect(texture.height).toBe(3);
  const out = new Float32Array(60);
  texture.getPixelBuffer(out);
  const expected = [-2.75, half ? 1 : 1 + 2 ** -22, 3.125, 2 ** -20];
  for (let pixel = 0; pixel < 15; pixel++) {
    for (let channel = 0; channel < channels; channel++) {
      expect(out[pixel * 4 + channel]).toBe(expected[(pixel * channels + channel) % 4]);
    }
  }
  expect(gl.getError()).toBe(gl.NO_ERROR);
});

it("loads a 5x3 crop of the Grasslands Uint16 heightmap without losing bits", async () => {
  const supported = !!gl.getExtension("EXT_texture_norm16");
  const url = new URL("./fixtures/float-ktx2/editor-R16_UNORM.ktx2", import.meta.url).href;
  const loading = engine.resourceManager.load<Texture2D>({ url, type: AssetType.KTX2 });
  if (!supported) {
    await expect(loading).rejects.toThrow();
    return;
  }
  const texture = await loading;
  expect(texture.format).toBe(TextureFormat.R16_UNORM);
  const pixels = new Uint16Array(5 * 3 * 4);
  texture.getPixelBuffer(pixels);
  expect(Array.from(pixels.filter((_, i) => i % 4 === 0))).toEqual([
    9388, 9344, 9302, 9258, 9214, 9396, 9352, 9310, 9266, 9222, 9406, 9362, 9318, 9274, 9230
  ]);
  expect(gl.getError()).toBe(gl.NO_ERROR);
});

it("restores native R32F pixels into the existing texture", async () => {
  const url = new URL("./fixtures/float-ktx2/editor-R32F.ktx2", import.meta.url).href;
  const texture = await engine.resourceManager.load<Texture2D>({ url, type: AssetType.KTX2 });
  const original = new Float32Array(60);
  texture.getPixelBuffer(original);
  texture.setPixelBuffer(new Float32Array(15));
  const pixels = new Float32Array(60);
  texture.getPixelBuffer(pixels);
  expect(pixels[0]).toBe(0);
  const restorer = engine.resourceManager["_contentRestorerPool"][texture.instanceId];
  expect(await restorer.restoreContent()).toBe(texture);
  texture.getPixelBuffer(pixels);
  expect(pixels).toEqual(original);
  expect(gl.getError()).toBe(gl.NO_ERROR);
});
