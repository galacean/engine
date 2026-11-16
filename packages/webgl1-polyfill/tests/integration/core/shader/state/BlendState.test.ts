import { BlendOperation, BlendState } from "../../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../../helpers/createEngine";

it("rejects Min without EXT_blend_minmax", async () => {
  const { engine } = await createEngine(["EXT_blend_minmax"]);
  try {
    const device = engine._hardwareRenderer;
    expect(() => (BlendState as any)._getGLBlendOperation(device, BlendOperation.Min)).toThrow("BlendOperation.Min");
  } finally {
    engine.destroy();
  }
});
