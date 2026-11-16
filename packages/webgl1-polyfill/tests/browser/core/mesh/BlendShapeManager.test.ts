import {
  BlendShape,
  BlendShapeFrame,
  PrimitiveMesh,
  Vector3,
  WebGLEngine
} from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("keeps large blend shape sets in vertex buffers only on the fallback device", async () => {
  const { engine: fallback, gl } = await createEngine();
  let native: WebGLEngine | undefined;
  try {
    native = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    for (const engine of [native, fallback]) {
      const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      const positions = Array.from({ length: mesh.vertexCount }, () => new Vector3(0.1, 0, 0));
      for (let i = 0; i < 9; i++) {
        const shape = new BlendShape(`deformation${i}`);
        shape.addFrame(new BlendShapeFrame(1, positions));
        mesh.addBlendShape(shape);
      }
      mesh.uploadData(false);
      const manager = mesh._blendShapeManager;
      if (engine === fallback) {
        expect(manager._vertexBuffers.length).toBeGreaterThan(0);
        expect(manager._vertexTexture).toBeFalsy();
      } else {
        expect(manager._vertexTexture).toBeTruthy();
        expect(manager._vertexBuffers).toHaveLength(0);
      }
    }
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    native?.destroy();
    fallback.destroy();
  }
});
