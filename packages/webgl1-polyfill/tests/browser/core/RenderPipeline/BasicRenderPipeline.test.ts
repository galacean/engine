import { Camera, Color } from "../../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../../helpers/createEngine";

it("renders without framebuffer blit", async () => {
  const { engine, gl } = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    scene.background.solidColor = new Color(0, 1, 0, 1);
    camera.render();
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect([...pixel]).toEqual([0, 255, 0, 255]);
    expect((camera._renderPipeline as any)._canUseBlitFrameBuffer).toBe(false);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
