import { FontAtlas, TextureFormat } from "../../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../../helpers/createEngine";

it("uses Alpha8 for glyph storage", async () => {
  const { engine } = await createEngine();
  try {
    const atlas = new FontAtlas(engine);
    expect(atlas.texture.format).toBe(TextureFormat.Alpha8);
  } finally {
    engine.destroy();
  }
});
