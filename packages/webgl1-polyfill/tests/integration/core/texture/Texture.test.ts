import { Logger, Texture2D, TextureDepthCompareFunction } from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("leaves the public depth compare function unchanged", async () => {
  const { engine } = await createEngine();
  try {
    const texture = new Texture2D(engine, 4, 4);
    const warn = vi.spyOn(Logger, "warn");
    const compare = texture.depthCompareFunction;
    texture.depthCompareFunction = TextureDepthCompareFunction.Less;
    expect(texture.depthCompareFunction).toBe(compare);
    expect(warn).toHaveBeenCalledWith("depthCompareFunction only support WebGL2");
    warn.mockRestore();
  } finally {
    engine.destroy();
  }
});

it("initializes the mip chain after applying NPOT fallback", async () => {
  const { engine } = await createEngine();
  try {
    for (const [width, height, mipmap, expectedCount] of [
      [3, 5, true, 1],
      [4, 8, true, 4],
      [4, 8, false, 1]
    ] as const) {
      const texture = new Texture2D(engine, width, height, undefined, mipmap);
      expect(texture.mipmapCount).toBe(expectedCount);
      texture.destroy();
    }
  } finally {
    engine.destroy();
  }
});
