import { Camera, CanvasRenderMode, UICanvas, UIImage, UITransform } from "@galacean/engine";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";

describe("UICanvas", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.height = 1334;
  webCanvas.width = 750;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");
  const uiCanvas = root.addComponent(UICanvas);
  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);

  engine.run();

  // Check default properties
  it("WorldSpace", () => {
    const imageEntity = root.createChild("image");
    const image = imageEntity.addComponent(UIImage);
    const uiTransform = <UITransform>imageEntity.transform;
    uiTransform.rect.x = 100;
    uiTransform.rect.y = 100;

    uiCanvas.renderMode = CanvasRenderMode.WorldSpace;
    cameraEntity.transform.position.set(0, 0, 100);
  });
});
