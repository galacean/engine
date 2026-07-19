/**
 * @title UI RectMask2D
 * @category UI
 */
import * as dat from "dat.gui";
import { Camera, Color, Sprite, Texture2D, Vector2, WebGLEngine } from "@galacean/engine";
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

  // Frame card
  const frameEntity = canvasEntity.createChild("Frame");
  (<UITransform>frameEntity.transform).size.set(560, 460);
  (<UITransform>frameEntity.transform).setPosition(-180, 20, 0);
  const frame = frameEntity.addComponent(Image);
  frame.sprite = solidSprite;
  frame.color.set(0.09, 0.11, 0.15, 1);

  // Viewport with RectMask2D
  const viewportEntity = frameEntity.createChild("Viewport");
  (<UITransform>viewportEntity.transform).size.set(440, 320);
  (<UITransform>viewportEntity.transform).setPosition(30, -10, 0);
  const viewport = viewportEntity.addComponent(Image);
  viewport.sprite = solidSprite;
  viewport.color.set(0.17, 0.18, 0.2, 1);
  const rectMask = viewportEntity.addComponent(RectMask2D);

  // 3x3 colored tiles overflow the viewport
  const contentEntity = viewportEntity.createChild("Content");
  (<UITransform>contentEntity.transform).size.set(740, 560);
  (<UITransform>contentEntity.transform).setPosition(80, -60, 0);

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
      const t = <UITransform>tileEntity.transform;
      t.size.set(tileWidth, tileHeight);
      t.setPosition(col * (tileWidth + gap) - 170, 170 - row * (tileHeight + gap), 0);

      const tile = tileEntity.addComponent(Image);
      tile.sprite = solidSprite;
      tile.color = colors[index];

      const labelEntity = tileEntity.createChild("Label");
      (<UITransform>labelEntity.transform).size.set(tileWidth, tileHeight);
      const label = labelEntity.addComponent(Text);
      label.text = `${index + 1}`;
      label.fontSize = 56;
      label.color.set(1, 1, 1, 1);
    }
  }

  // Right info card
  const noteEntity = canvasEntity.createChild("Note");
  (<UITransform>noteEntity.transform).size.set(360, 220);
  (<UITransform>noteEntity.transform).setPosition(290, 20, 0);
  const note = noteEntity.addComponent(Image);
  note.sprite = solidSprite;
  note.color.set(0.08, 0.09, 0.12, 1);

  const noteTextEntity = noteEntity.createChild("Copy");
  (<UITransform>noteTextEntity.transform).size.set(320, 180);
  const noteText = noteTextEntity.addComponent(Text);
  noteText.text =
    "RectMask2D clips Image\nand Text by an axis-\naligned rectangle.\n\nUse the GUI to tweak\nsoftness / alphaClip.";
  noteText.fontSize = 26;
  noteText.color.set(0.77, 0.82, 0.89, 1);

  const gui = new dat.GUI();
  const state = {
    softnessX: 0,
    softnessY: 0,
    alphaClip: false
  };
  gui
    .add(state, "softnessX", 0, 80, 1)
    .name("softness.x")
    .onChange((v: number) => {
      rectMask.softness = new Vector2(v, state.softnessY);
    });
  gui
    .add(state, "softnessY", 0, 80, 1)
    .name("softness.y")
    .onChange((v: number) => {
      rectMask.softness = new Vector2(state.softnessX, v);
    });
  gui
    .add(state, "alphaClip")
    .name("alphaClip (discard)")
    .onChange((v: boolean) => {
      rectMask.alphaClip = v;
    });

  engine.run();
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
