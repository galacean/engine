/**
 * @title UI RectMask2D Nested
 * @category UI
 */
import { Camera, Color, Sprite, Texture2D, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, RectMask2D, Text, UICanvas, UITransform } from "@galacean/engine-ui";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.03, 0.04, 0.07, 1);
  const root = scene.createRootEntity("Root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  const canvasEntity = root.createChild("UICanvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
  uiCanvas.camera = camera;
  uiCanvas.referenceResolutionPerUnit = 100;
  uiCanvas.referenceResolution.set(1200, 800);

  const solidSprite = createSolidSprite(engine);

  // Outer mask (wide, short)
  const outerEntity = canvasEntity.createChild("OuterMask");
  (<UITransform>outerEntity.transform).size.set(560, 240);
  (<UITransform>outerEntity.transform).setPosition(0, 60, 0);
  const outerImage = outerEntity.addComponent(Image);
  outerImage.sprite = solidSprite;
  outerImage.color.set(0.13, 0.18, 0.28, 1);
  outerEntity.addComponent(RectMask2D);

  // Inner mask (tall, narrow), child of outer
  const innerEntity = outerEntity.createChild("InnerMask");
  (<UITransform>innerEntity.transform).size.set(240, 480);
  (<UITransform>innerEntity.transform).setPosition(0, 0, 0);
  const innerImage = innerEntity.addComponent(Image);
  innerImage.sprite = solidSprite;
  innerImage.color.set(0.2, 0.3, 0.5, 1);
  innerEntity.addComponent(RectMask2D);

  // Big colored content under both masks — only the intersection of outer ∩ inner remains visible
  const contentEntity = innerEntity.createChild("Content");
  (<UITransform>contentEntity.transform).size.set(800, 800);
  const content = contentEntity.addComponent(Image);
  content.sprite = solidSprite;
  content.color.set(0.95, 0.61, 0.07, 1);

  const labelTopEntity = canvasEntity.createChild("LabelTop");
  (<UITransform>labelTopEntity.transform).size.set(900, 60);
  (<UITransform>labelTopEntity.transform).setPosition(0, 220, 0);
  const labelTop = labelTopEntity.addComponent(Text);
  labelTop.text = "Outer 560x240  ∩  Inner 240x480  →  visible: 240x240";
  labelTop.fontSize = 28;
  labelTop.color.set(1, 1, 1, 1);

  const labelBottomEntity = canvasEntity.createChild("LabelBottom");
  (<UITransform>labelBottomEntity.transform).size.set(900, 60);
  (<UITransform>labelBottomEntity.transform).setPosition(0, -260, 0);
  const labelBottom = labelBottomEntity.addComponent(Text);
  labelBottom.text = "Nested RectMask2D takes the rect intersection of all ancestor masks.";
  labelBottom.fontSize = 24;
  labelBottom.color.set(0.77, 0.82, 0.89, 1);

  engine.run();
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
