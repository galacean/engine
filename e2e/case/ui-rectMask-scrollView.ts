/**
 * @title UI RectMask ScrollView
 * @category UI
 */
import { Camera, Color, Sprite, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
import {
  CanvasRenderMode,
  Image,
  RectMask2D,
  ScrollView,
  ScrollViewMode,
  Text,
  UICanvas,
  UITransform
} from "../../packages/ui/dist/module.js";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

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
  uiCanvas.referenceResolutionPerUnit = 1;
  uiCanvas.referenceResolution.set(1200, 800);

  const solidSprite = createSolidSprite(engine);

  const frameEntity = canvasEntity.createChild("Frame");
  const frameTransform = frameEntity.transform as UITransform;
  frameTransform.size.set(520, 420);
  frameTransform.setPosition(-170, 20, 0);
  const frameBackground = frameEntity.addComponent(Image);
  frameBackground.sprite = solidSprite;
  frameBackground.color.set(0.09, 0.11, 0.15, 1);

  const viewportEntity = frameEntity.createChild("Viewport");
  const viewportTransform = viewportEntity.transform as UITransform;
  viewportTransform.size.set(440, 320);
  viewportTransform.setPosition(30, -10, 0);
  const viewportBackground = viewportEntity.addComponent(Image);
  viewportBackground.sprite = solidSprite;
  viewportBackground.color.set(0.17, 0.18, 0.2, 1);

  const rectMask = viewportEntity.addComponent(RectMask2D);
  rectMask.alphaClip = true;

  const contentEntity = viewportEntity.createChild("Content");
  const contentTransform = contentEntity.transform as UITransform;
  contentTransform.size.set(740, 560);
  contentTransform.setPosition(90, -70, 0);

  const scrollView = viewportEntity.addComponent(ScrollView);
  scrollView.mode = ScrollViewMode.VerticalAndHorizontal;
  scrollView.viewport = viewportEntity;
  scrollView.content = contentEntity;

  const colors = [
    new Color(0.91, 0.3, 0.24, 1),
    new Color(0.16, 0.5, 0.73, 1),
    new Color(0.18, 0.8, 0.44, 1),
    new Color(0.95, 0.61, 0.07, 1),
    new Color(0.56, 0.27, 0.68, 1),
    new Color(0.2, 0.6, 0.86, 1),
    new Color(0.83, 0.33, 0.33, 1),
    new Color(0.1, 0.74, 0.61, 1),
    new Color(0.93, 0.78, 0.0, 1)
  ];

  const tileWidth = 180;
  const tileHeight = 180;
  const gap = 10;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const tileEntity = contentEntity.createChild(`Tile_${index}`);
      const tileTransform = tileEntity.transform as UITransform;
      tileTransform.size.set(tileWidth, tileHeight);
      tileTransform.setPosition(col * (tileWidth + gap) - 170, 170 - row * (tileHeight + gap), 0);

      const tile = tileEntity.addComponent(Image);
      tile.sprite = solidSprite;
      tile.color = colors[index];

      const labelEntity = tileEntity.createChild("Label");
      const labelTransform = labelEntity.transform as UITransform;
      labelTransform.size.set(tileWidth, tileHeight);
      const label = labelEntity.addComponent(Text);
      label.text = `${index + 1}`;
      label.fontSize = 56;
      label.color.set(1, 1, 1, 1);
    }
  }

  const titleEntity = canvasEntity.createChild("Title");
  const titleTransform = titleEntity.transform as UITransform;
  titleTransform.size.set(620, 70);
  titleTransform.setPosition(-160, 250, 0);
  const title = titleEntity.addComponent(Text);
  title.text = "RectMask2D keeps Image and Text visible";
  title.fontSize = 38;
  title.color.set(0.96, 0.97, 0.99, 1);

  const noteEntity = canvasEntity.createChild("Note");
  const noteTransform = noteEntity.transform as UITransform;
  noteTransform.size.set(340, 180);
  noteTransform.setPosition(290, 10, 0);
  const noteCard = noteEntity.addComponent(Image);
  noteCard.sprite = solidSprite;
  noteCard.color.set(0.08, 0.09, 0.12, 1);

  const noteTextEntity = noteEntity.createChild("Copy");
  const noteTextTransform = noteTextEntity.transform as UITransform;
  noteTextTransform.size.set(260, 120);
  noteTextTransform.setPosition(0, 0, 0);
  const noteText = noteTextEntity.addComponent(Text);
  noteText.text = "Mask on.\nTiles still render.\nNumbers still render.";
  noteText.fontSize = 28;
  noteText.color.set(0.77, 0.82, 0.89, 1);

  updateForE2E(engine);
  initScreenshot(engine, camera);
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
