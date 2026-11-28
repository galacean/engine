import { Camera, Script, WebGLEngine } from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { expect, it } from "vitest";

it("creates an ES5 toolkit control against the opted-in Engine source graph", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  document.body.append(canvas);
  const engine = await WebGLEngine.create({ canvas });
  try {
    const camera = engine.sceneManager.activeScene.createRootEntity("camera");
    camera.addComponent(Camera);
    const control = camera.addComponent(OrbitControl);
    expect(control).toBeInstanceOf(Script);
    expect(control.entity).toBe(camera);
    expect(() => engine.update()).not.toThrow();
  } finally {
    engine.destroy();
    canvas.remove();
  }
});
