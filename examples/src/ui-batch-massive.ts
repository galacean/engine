/**
 * @title UI Batch Massive Buttons
 * @category UI
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 *
 * Stress test on dev/2.0: 96 buttons (192 sub-elements) on a single canvas.
 * Each button = bg sprite + icon sprite (different sprites, must overlap correctly).
 * Watch the Stats panel — DrawCall reflects current batching strategy.
 */
import { Stats } from "@galacean/engine-toolkit-stats";
import { Camera, Color, Sprite, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
import {
  CanvasRenderMode,
  Image,
  registerGUI,
  ResolutionAdaptationMode,
  UICanvas,
  UITransform
} from "@galacean/engine-ui";

registerGUI();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity("root");

  // Camera
  const cameraEntity = root.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(Stats);

  // Canvas
  const canvasEntity = root.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
  canvas.renderCamera = camera;
  canvas.referenceResolution.set(1280, 720);
  canvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;

  const bgSprite = new Sprite(engine, makeRoundedTexture(engine, [50, 90, 180, 255]));
  const iconSprite = new Sprite(engine, makeStarTexture(engine, [255, 200, 60, 255]));

  // 100×60 = 6000 buttons → 12000 sub-elements
  const cols = 100;
  const rows = 60;
  const buttonW = 10;
  const buttonH = 8;
  const gapX = 12;
  const gapY = 10;
  const startX = -((cols - 1) * gapX) / 2;
  const startY = -((rows - 1) * gapY) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * gapX;
      const y = startY + r * gapY;

      const bg = canvasEntity.createChild(`bg-${r}-${c}`);
      bg.transform.setPosition(x, y, 0);
      const bgT = bg.transform as UITransform;
      bgT.size.set(buttonW, buttonH);
      const bgImg = bg.addComponent(Image);
      bgImg.sprite = bgSprite;
      bgImg.color = new Color(1, 1, 1, 1);

      const icon = canvasEntity.createChild(`icon-${r}-${c}`);
      icon.transform.setPosition(x, y, 0);
      const iconT = icon.transform as UITransform;
      iconT.size.set(buttonW * 0.5, buttonH * 0.5);
      const iconImg = icon.addComponent(Image);
      iconImg.sprite = iconSprite;
      iconImg.color = new Color(1, 1, 1, 1);
    }
  }

  engine.run();
});

// Rounded panel: filled rect with darker border (mimics 9-slice button background)
function makeRoundedTexture(engine: WebGLEngine, rgba: number[]): Texture2D {
  const size = 32;
  const tex = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
  const data = new Uint8Array(size * size * 4);
  const border = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const isBorder = x < border || x >= size - border || y < border || y >= size - border;
      const tint = isBorder ? 0.6 : 1.0;
      data[i] = rgba[0] * tint;
      data[i + 1] = rgba[1] * tint;
      data[i + 2] = rgba[2] * tint;
      data[i + 3] = rgba[3];
    }
  }
  tex.setPixelBuffer(data);
  return tex;
}

// 5-pointed star silhouette on transparent background (mimics atlas icon)
function makeStarTexture(engine: WebGLEngine, rgba: number[]): Texture2D {
  const size = 32;
  const tex = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
  const data = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.45;
  const inner = outer * 0.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const angle = Math.atan2(dy, dx);
      const dist = Math.hypot(dx, dy);
      const t = (Math.cos(5 * angle - Math.PI / 2) + 1) * 0.5;
      const radius = inner + (outer - inner) * t;
      const inside = dist <= radius;
      data[i] = inside ? rgba[0] : 0;
      data[i + 1] = inside ? rgba[1] : 0;
      data[i + 2] = inside ? rgba[2] : 0;
      data[i + 3] = inside ? rgba[3] : 0;
    }
  }
  tex.setPixelBuffer(data);
  return tex;
}
