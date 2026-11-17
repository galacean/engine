import { TextureFormat, TextureUtils, WebGLEngine } from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("applies NPOT and sRGB mipmap restrictions only to the fallback engine", async () => {
  const { engine } = await createEngine();
  const native = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  try {
    for (const [width, height, mipmap, srgb, fallbackExpected, nativeExpected] of [
      [3, 5, true, false, false, true],
      [4, 4, true, false, true, true],
      [4, 4, false, false, false, false],
      [4, 4, true, true, false, true]
    ] as const) {
      for (const [deviceEngine, expected] of [
        [engine, fallbackExpected],
        [native, nativeExpected]
      ] as const) {
        expect(
          TextureUtils.supportGenerateMipmapsWithCorrection(
            deviceEngine,
            width,
            height,
            TextureFormat.R8G8B8A8,
            mipmap,
            srgb
          )
        ).toBe(expected);
      }
    }
  } finally {
    native.destroy();
    engine.destroy();
  }
});
