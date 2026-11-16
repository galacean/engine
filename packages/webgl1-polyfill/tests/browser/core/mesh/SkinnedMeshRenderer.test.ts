import { Logger, SkinnedMeshRenderer } from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it.each([
  { disabled: [], vertexTextureUnits: 1, useTexture: true },
  { disabled: ["OES_texture_float"], vertexTextureUnits: 1, useTexture: false },
  { disabled: [], vertexTextureUnits: 0, useTexture: false }
])("uses joint textures only when both float textures and vertex sampling are available (%j)", async (config) => {
  const { engine, gl } = await createEngine(config.disabled);
  const getParameter = gl.getParameter.bind(gl);
  const limit = vi
    .spyOn(gl, "getParameter")
    .mockImplementation((name) =>
      name === gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS ? config.vertexTextureUnits : getParameter(name)
    );
  const error = vi.spyOn(Logger, "error");
  try {
    const renderer = engine.sceneManager.activeScene!.createRootEntity().addComponent(SkinnedMeshRenderer);
    const matrices = new Float32Array(16 * 2);
    renderer["_configureJointStorage"](1, 1, true, matrices);
    expect(renderer.shaderData.getFloatArray("renderer_JointMatrix")).toBe(matrices);
    expect(error).not.toHaveBeenCalled();

    renderer["_configureJointStorage"](2, 1, true, matrices);
    expect(!!renderer.shaderData.getTexture("renderer_JointSampler")).toBe(config.useTexture);
    if (config.useTexture) {
      expect(error).not.toHaveBeenCalled();
    } else {
      expect(error).toHaveBeenCalledWith(expect.stringContaining("don't support jointTexture"), renderer);
    }
    renderer["_configureJointStorage"](3, 1, true, new Float32Array(16 * 3));
    expect(limit.mock.calls.filter(([parameter]) => parameter === gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)).toHaveLength(
      config.disabled.length ? 0 : 1
    );
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    error.mockRestore();
    limit.mockRestore();
    engine.destroy();
  }
});
