import {
  Texture2D,
  Texture2DArray,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { afterAll, beforeAll, expect, it } from "vitest";

let engine: WebGLEngine;
let gl: WebGL2RenderingContext;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 } });
  gl = canvas.getContext("webgl2")!;
});
afterAll(() => engine.destroy());

it("uploads and replaces ETC1 mip levels without subimage calls", () => {
  if (!gl.getExtension("WEBGL_compressed_texture_etc1")) return;
  const texture = new Texture2D(engine, 4, 4, TextureFormat.ETC1_RGB, false, false);
  texture.setPixelBuffer(new Uint8Array(8));
  texture.setPixelBuffer(new Uint8Array(8));
  expect(() => texture.setPixelBuffer(new Uint8Array(8), 0, 0, 0, 2, 2)).toThrow("entire mip");
  const cube = new TextureCube(engine, 4, TextureFormat.ETC1_RGB, false, false);
  cube.setPixelBuffer(TextureCubeFace.PositiveX, new Uint8Array(8));
  cube.setPixelBuffer(TextureCubeFace.PositiveX, new Uint8Array(8));
  expect(gl.getError()).toBe(gl.NO_ERROR);
  texture.destroy(true);
  cube.destroy(true);
});

it.each([TextureFormat.Depth16, TextureFormat.Depth24, TextureFormat.Depth32, TextureFormat.Depth24Stencil8])(
  "uploads depth format %s with valid unpack alignment",
  (format) => {
    const texture = new Texture2D(engine, 3, 2, format, false, false);
    const input =
      format === TextureFormat.Depth16
        ? new Uint16Array(6)
        : format === TextureFormat.Depth32
          ? new Float32Array(6)
          : new Uint32Array(6);
    texture.setPixelBuffer(input);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    texture.destroy(true);
  }
);

it.each([
  [TextureFormat.R16, 1, true],
  [TextureFormat.R16G16, 2, true],
  [TextureFormat.R32, 1, false],
  [TextureFormat.R32G32, 2, false]
] as const)(
  "round trips float format %s with odd-width uploads and array readback overloads",
  (format, channels, half) => {
    const input = half ? new Uint16Array(6 * channels).fill(0xc180) : new Float32Array(6 * channels).fill(-2.75);
    const texture = new Texture2D(engine, 3, 2, format, false, false);
    texture.setPixelBuffer(input);
    const out = new Float32Array(24);
    texture.getPixelBuffer(out);
    for (let i = 0; i < 6; i++) for (let c = 0; c < channels; c++) expect(out[i * 4 + c]).toBe(-2.75);
    const array = new Texture2DArray(engine, 3, 2, 2, format, false, false);
    array.setPixelBuffer(1, input, 0, 0, 0, 3, 2, 1);
    for (const read of [
      () => array.getPixelBuffer(1, out),
      () => array.getPixelBuffer(1, 0, out),
      () => array.getPixelBuffer(1, 0, 0, 3, 2, out),
      () => array.getPixelBuffer(1, 0, 0, 3, 2, 0, out)
    ]) {
      out.fill(0);
      read();
      expect(out[0]).toBe(-2.75);
      expect(out[20]).toBe(-2.75);
    }
    const cube = new TextureCube(engine, 1, format, false, false);
    cube.setPixelBuffer(TextureCubeFace.PositiveX, input.subarray(0, channels));
    cube.getPixelBuffer(TextureCubeFace.PositiveX, out);
    expect(out[0]).toBe(-2.75);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    texture.destroy(true);
    array.destroy(true);
    cube.destroy(true);
  }
);
