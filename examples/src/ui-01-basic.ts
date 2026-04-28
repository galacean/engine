/**
 * @title UI 01 - 基础 UI 组件
 * @category UI 教程
 */
import {
  Camera,
  Color,
  Entity,
  Font,
  Logger,
  Sprite,
  Texture2D,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { CanvasRenderMode, Image, Text, UICanvas, UITransform } from "@galacean/engine-ui";

function createColorTexture(engine: WebGLEngine, r: number, g: number, b: number, a: number = 255): Texture2D {
  const texture = new Texture2D(engine, 4, 4);
  const data = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 64; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  texture.setPixelBuffer(data);
  return texture;
}

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  // UI Canvas (ScreenSpace Overlay)
  const canvasEntity = rootEntity.createChild("Canvas");
  const canvas = canvasEntity.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  canvas.referenceResolution = new Vector2(800, 600);
  canvas.renderCamera = camera;

  // --- Background Panel ---
  const panelEntity = canvasEntity.createChild("Panel");
  const panelTransform = <UITransform>panelEntity.transform;
  panelTransform.size = new Vector2(400, 300);
  const panelImage = panelEntity.addComponent(Image);
  panelImage.sprite = new Sprite(engine, createColorTexture(engine, 40, 40, 60));
  panelImage.color = new Color(1, 1, 1, 0.9);

  // --- Title Text ---
  const titleEntity = panelEntity.createChild("Title");
  const titleTransform = <UITransform>titleEntity.transform;
  titleTransform.size = new Vector2(300, 50);
  titleEntity.transform.setPosition(0, 100, 0);
  const title = titleEntity.addComponent(Text);
  title.text = "Galacean UI";
  title.fontSize = 32;
  title.color = new Color(1, 1, 1, 1);

  // --- Colored Images ---
  const colors = [
    { r: 231, g: 76, b: 60 },
    { r: 46, g: 204, b: 113 },
    { r: 52, g: 152, b: 219 }
  ];
  const labels = ["Red", "Green", "Blue"];
  for (let i = 0; i < 3; i++) {
    const itemEntity = panelEntity.createChild(`Item${i}`);
    const itemTransform = <UITransform>itemEntity.transform;
    itemTransform.size = new Vector2(100, 100);
    itemEntity.transform.setPosition(-120 + i * 120, -20, 0);

    const img = itemEntity.addComponent(Image);
    const { r, g, b } = colors[i];
    img.sprite = new Sprite(engine, createColorTexture(engine, r, g, b));

    const labelEntity = itemEntity.createChild("Label");
    const labelTransform = <UITransform>labelEntity.transform;
    labelTransform.size = new Vector2(100, 30);
    labelEntity.transform.setPosition(0, -70, 0);
    const label = labelEntity.addComponent(Text);
    label.text = labels[i];
    label.fontSize = 18;
    label.color = new Color(0.8, 0.8, 0.8, 1);
  }

  engine.run();
});
