import {
  BlendShape,
  BlendShapeFrame,
  GLCapabilityType,
  PrimitiveMesh,
  Vector3
} from "../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it("detects extensions and falls back to one draw buffer and sample", async () => {
  const { engine } = await createEngine(["ANGLE_instanced_arrays", "WEBGL_draw_buffers"]);
  try {
    const device = engine._hardwareRenderer;
    expect(device.canIUse(GLCapabilityType.instancedArrays)).toBe(false);
    expect(device.canIUse(GLCapabilityType.vertexArrayObject)).toBe(true);
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

it("stores blend shapes in vertex buffers when vertex IDs are unavailable", async () => {
  const { engine, gl } = await createEngine();
  try {
    const mesh = PrimitiveMesh.createCuboid(engine);
    const shape = new BlendShape("deformation");
    shape.addFrame(
      new BlendShapeFrame(
        1,
        Array.from({ length: mesh.vertexCount }, () => new Vector3(0.1, 0, 0))
      )
    );
    mesh.addBlendShape(shape);
    mesh.uploadData(false);
    expect(mesh._blendShapeManager._vertexBuffers.length).toBeGreaterThan(0);
    expect(mesh._blendShapeManager._vertexTexture).toBeFalsy();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
