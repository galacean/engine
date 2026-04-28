/**
 * @title UI Mask Alpha Cutoff
 * @category UI
 */
import * as dat from "dat.gui";
import { Camera, Color, Sprite, SpriteMaskInteraction, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, Mask, Text, UICanvas, UITransform } from "@galacean/engine-ui";

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
  const circleSprite = createCircleSprite(engine, 256);

  const groupEntity = canvasEntity.createChild("Group");
  (<UITransform>groupEntity.transform).setPosition(0, 40, 0);

  // Circular mask
  const maskEntity = groupEntity.createChild("Mask");
  (<UITransform>maskEntity.transform).size.set(300, 300);
  const mask = maskEntity.addComponent(Mask);
  mask.sprite = circleSprite;
  mask.alphaCutoff = 0.5;

  // Background visible inside circle
  const insideEntity = groupEntity.createChild("Inside");
  (<UITransform>insideEntity.transform).size.set(500, 500);
  const inside = insideEntity.addComponent(Image);
  inside.sprite = solidSprite;
  inside.color.set(0.95, 0.61, 0.07, 1);
  inside.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;

  const labelEntity = canvasEntity.createChild("Label");
  (<UITransform>labelEntity.transform).size.set(800, 80);
  (<UITransform>labelEntity.transform).setPosition(0, -260, 0);
  const label = labelEntity.addComponent(Text);
  label.text = "Drag the slider to change alphaCutoff";
  label.fontSize = 28;
  label.color.set(0.85, 0.9, 1, 1);

  const gui = new dat.GUI();
  const state = { alphaCutoff: 0.5 };
  gui
    .add(state, "alphaCutoff", 0.0, 1.0, 0.01)
    .name("Mask Alpha Cutoff")
    .onChange((value: number) => {
      mask.alphaCutoff = value;
    });

  engine.run();
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}

/** Soft circle: alpha falls off radially so alphaCutoff has visible effect. */
function createCircleSprite(engine: WebGLEngine, size: number): Sprite {
  const buffer = new Uint8Array(size * size * 4);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const radius = size * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - dist / radius);
      const alpha = Math.min(255, Math.floor(t * 255));
      const i = (y * size + x) * 4;
      buffer[i] = 255;
      buffer[i + 1] = 255;
      buffer[i + 2] = 255;
      buffer[i + 3] = alpha;
    }
  }
  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
  texture.setPixelBuffer(buffer);
  return new Sprite(engine, texture);
}
