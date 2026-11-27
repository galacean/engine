import { Camera, Sprite, Texture2D, WebGLEngine } from "@galacean/engine";
import { WebGPUEngine } from "@galacean/engine-webgpu";
import { CanvasRenderMode, Image, UICanvas, UITransform } from "@galacean/engine-ui";
import { expect, it } from "vitest";

for (const backend of ["webgl2", "webgpu"] as const) {
  it(`preserves sprites in separate screen overlays across frames on ${backend}`, async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const engine = backend === "webgpu" ? await WebGPUEngine.create({ canvas }) : await WebGLEngine.create({ canvas });
    try {
      const scene = engine.sceneManager.activeScene!;
      scene.background.solidColor.set(0, 0, 1, 1);
      scene.createRootEntity().addComponent(Camera).enableHDR = false;
      const texture = new Texture2D(engine, 1, 1);
      texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
      const sprite = new Sprite(engine, texture);
      for (const [offset, red, green] of [[-16, 1, 0], [16, 0, 1]]) {
        const overlay = scene.createRootEntity().addComponent(UICanvas);
        overlay.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
        overlay.referenceResolution.set(64, 64);
        const image = overlay.entity.createChild().addComponent(Image);
        image.sprite = sprite;
        image.color.set(red, green, 0, 1);
        const transform = image.entity.transform as UITransform;
        transform.size.set(16, 16);
        transform.setPosition(offset, 0, 0);
      }

      // Each overlay flushes a separate slice of the same sprite chunk.
      engine.update();
      engine.update();
      const target = document.createElement("canvas");
      target.width = target.height = 64;
      const context = target.getContext("2d")!;
      context.drawImage(canvas, 0, 0);
      const pixelAt = (x: number) => Array.from(context.getImageData(x, 32, 1, 1).data);
      expect(pixelAt(16)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(32)).toEqual([0, 0, 255, 255]);
      expect(pixelAt(48)).toEqual([0, 255, 0, 255]);
    } finally {
      engine.destroy();
    }
  });
}
