import { expect, it } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it("omits default array and integer textures", async () => {
  const { engine } = await createEngine();
  try {
    expect(engine._basicResources.whiteTexture2DArray).toBeUndefined();
    expect(engine._basicResources.uintWhiteTexture2D).toBeUndefined();
  } finally {
    engine.destroy();
  }
});
