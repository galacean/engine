import { Texture2D, TextureFormat, WebGLEngine } from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createWebGL1Canvas } from "../../helpers/canvas";

it("allocates and updates a compressed 2D mip", async () => {
  const canvas = createWebGL1Canvas();
  const gl = canvas.getContext("webgl")!;
  expect(gl.getExtension("WEBGL_compressed_texture_s3tc")).not.toBeNull();
  const engine = await WebGLEngine.create({ canvas });
  try {
    const allocate = vi.spyOn(gl, "compressedTexImage2D");
    const update = vi.spyOn(gl, "compressedTexSubImage2D");
    const data = new Uint8Array(8);
    const texture = new Texture2D(engine, 4, 4, TextureFormat.DXT1, false, false);
    texture.setPixelBuffer(data);
    texture.setPixelBuffer(data);
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
