import { SystemInfo, TextureFormat } from "../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it("reports RG8 as unsupported", async () => {
  const { engine } = await createEngine();
  try {
    expect(SystemInfo.supportsTextureFormat(engine, TextureFormat.R8G8)).toBe(false);
  } finally {
    engine.destroy();
  }
});
