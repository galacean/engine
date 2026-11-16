import { Texture2D, TextureCube, TextureFormat } from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it("allocates the available mips and every cube face with texImage2D", async () => {
  const { engine, gl } = await createEngine();
  try {
    const storage = vi.spyOn(gl, "texImage2D");
    new Texture2D(engine, 3, 5, TextureFormat.R8G8B8A8, true, false);
    expect(storage.mock.calls).toEqual([[gl.TEXTURE_2D, 0, gl.RGBA, 3, 5, 0, gl.RGBA, gl.UNSIGNED_BYTE, null]]);

    storage.mockClear();
    new TextureCube(engine, 4, TextureFormat.R8G8B8A8, true, false);
    expect(storage.mock.calls.map(([face, level, , width, height]) => [face, level, width, height])).toEqual(
      [4, 2, 1].flatMap((size, level) =>
        Array.from({ length: 6 }, (_, face) => [gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, level, size, size])
      )
    );
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
