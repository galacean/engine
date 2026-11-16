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
