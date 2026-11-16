import { Engine, ShaderMacroCollection } from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("links a WebGL1 program without querying uniform blocks", async () => {
  const { engine, gl } = await createEngine();
  try {
    const getProgramParameter = vi.spyOn(gl, "getProgramParameter");
    const pass = Engine._builtinShaders.unlit.subShaders[0].passes[0];
    expect(pass._getShaderProgram(engine, new ShaderMacroCollection()).isValid).toBe(true);
    expect(getProgramParameter).toHaveBeenCalled();
    // ACTIVE_UNIFORM_BLOCKS is a WebGL2 program parameter.
    expect(getProgramParameter.mock.calls.every(([, pname]) => pname !== 0x8a36 && pname !== undefined)).toBe(true);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
