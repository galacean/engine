import { TextureFormat, TextureUtils } from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("rejects automatic mipmap generation for sRGB RGBA8", async () => {
  const { engine } = await createEngine();
  try {
    expect(TextureUtils.supportGenerateMipmapsWithCorrection(engine, 4, 4, TextureFormat.R8G8B8A8, true, true)).toBe(
      false
    );
  } finally {
    engine.destroy();
  }
});
