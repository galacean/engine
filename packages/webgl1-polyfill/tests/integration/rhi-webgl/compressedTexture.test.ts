import { Texture2D, TextureFormat } from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it("tracks compressed mip allocations independently per texture", async () => {
  const { engine, gl } = await createEngine();
  try {
    expect(gl.getExtension("WEBGL_compressed_texture_s3tc")).not.toBeNull();
    const allocate = vi.spyOn(gl, "compressedTexImage2D");
    const update = vi.spyOn(gl, "compressedTexSubImage2D");
    const first = new Texture2D(engine, 8, 8, TextureFormat.DXT1, true, false);
    const second = new Texture2D(engine, 8, 8, TextureFormat.DXT1, true, false);
    first.setPixelBuffer(new Uint8Array(32), 0);
    first.setPixelBuffer(new Uint8Array(8), 1);
    first.setPixelBuffer(new Uint8Array(8), 1);
    second.setPixelBuffer(new Uint8Array(8), 1);

    expect(allocate.mock.calls.map(([, mip]) => mip)).toEqual([0, 1, 1]);
    expect(update.mock.calls.map(([, mip]) => mip)).toEqual([1]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
