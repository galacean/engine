import { BlendOperation, BlendState } from "../../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../../helpers/createEngine";

it("rejects Min without EXT_blend_minmax", async () => {
  const { engine } = await createEngine(["EXT_blend_minmax"]);
  try {
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    const min = (BlendState as any)._getGLBlendOperation(device, BlendOperation.Min);
    expect(() => gl.blendEquationSeparate(min, gl.FUNC_ADD)).toThrow("BlendOperation.Min");
    expect(() => gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD)).not.toThrow();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
