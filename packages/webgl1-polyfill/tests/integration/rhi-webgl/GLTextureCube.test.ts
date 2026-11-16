import { TextureCube, TextureCubeFace, TextureFormat, WebGLEngine } from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createWebGL1Canvas } from "../../helpers/canvas";

it("allocates and updates a compressed cube mip", async () => {
  const canvas = createWebGL1Canvas();
  const gl = canvas.getContext("webgl")!;
  expect(gl.getExtension("WEBGL_compressed_texture_s3tc")).not.toBeNull();
  const engine = await WebGLEngine.create({ canvas });
  try {
    const allocate = vi.spyOn(gl, "compressedTexImage2D");
    const update = vi.spyOn(gl, "compressedTexSubImage2D");
    const data = new Uint8Array(8);
    const texture = new TextureCube(engine, 4, TextureFormat.DXT1, false, false);
    texture.setPixelBuffer(TextureCubeFace.PositiveX, data);
    texture.setPixelBuffer(TextureCubeFace.PositiveX, data);
    texture.setPixelBuffer(TextureCubeFace.NegativeX, data);
    expect(allocate).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("keeps NPOT cube maps complete by allocating only mip zero", async () => {
  const canvas = createWebGL1Canvas();
  const engine = await WebGLEngine.create({ canvas });
  try {
    const gl = canvas.getContext("webgl")!;
    const cube = new TextureCube(engine, 3, TextureFormat.R8G8B8A8, true, false);
    expect(cube.mipmapCount).toBe(1);
    cube.setPixelBuffer(TextureCubeFace.PositiveX, new Uint8Array(36).fill(255));
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
