import { GLCapabilityType } from "../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../helpers/createEngine";
import { WebGL1Extension } from "../../../src/rhi-webgl/WebGL1Extension";

it("detects extensions and falls back to one draw buffer and sample", async () => {
  const { engine, gl } = await createEngine([
    WebGL1Extension.instancedArrays,
    WebGL1Extension.drawBuffers,
    WebGL1Extension.sRGB,
    WebGL1Extension.blendMinMax,
    GLCapabilityType.textureFloatLinear
  ]);
  try {
    const device = engine._hardwareRenderer;
    expect(device.canIUse(GLCapabilityType.textureFloatLinear)).toBe(false);
    expect(device.canIUse(GLCapabilityType.transformFeedback)).toBe(false);
    expect(device.canIUse(GLCapabilityType.sRGBTexture)).toBe(false);
    expect(device.canIUse(GLCapabilityType.minMaxBlend)).toBe(false);
    expect(gl).not.toHaveProperty("drawArraysInstanced");
    expect(gl).toHaveProperty("createVertexArray", expect.any(Function));
    expect(engine._hardwareRenderer.capability.maxDrawBuffers).toBe(1);
    expect(engine._hardwareRenderer.capability.maxAntiAliasing).toBe(1);
  } finally {
    engine.destroy();
  }
});

it("reports the extension draw buffer limit", async () => {
  const { engine, gl } = await createEngine();
  try {
    const ext = gl.getExtension("WEBGL_draw_buffers")!;
    expect(engine._hardwareRenderer.capability.maxDrawBuffers).toBe(gl.getParameter(ext.MAX_DRAW_BUFFERS_WEBGL));
  } finally {
    engine.destroy();
  }
});
