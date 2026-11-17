import { AssetType, Texture2D, TextureFormat, WebGLEngine, WebGLMode } from "@galacean/engine";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;
let gl: WebGL2RenderingContext;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 } });
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
