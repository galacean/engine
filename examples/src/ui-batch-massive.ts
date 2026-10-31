/**
 * @title UI Batch Massive Buttons
 * @category UI
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*jjZMTrp-vU8AAAAAAAAAAAAADiR2AQ/original
 *
 * Stress test: 6000 buttons (12000 sub-elements) on a single canvas.
 * Each button = bg sprite (gradient panel) + icon sprite (atlas-sampled).
 * Watch the Stats panel — DrawCall reflects current batching strategy.
 */
import { Stats } from "@galacean/engine-toolkit-stats";
import { Camera, Color, Sprite, Texture2D, TextureFormat, WebGLEngine, Rect } from "@galacean/engine";
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

  // Two textures: a gradient bg panel and an icon atlas (4 icons in 2×2)
  // All buttons share these two textures, so all bg-sprites are batchable, and
  // all icon-sprites (using different atlas regions) are also batchable —
  // demonstrating cluster-by-(material, texture).
  const bgSprite = new Sprite(engine, makeGradientPanel(engine));
  const iconAtlasTexture = makeIconAtlas(engine);

  // 4 sub-sprites of the same atlas, rotating per button
  const iconSprites = [
    new Sprite(engine, iconAtlasTexture, new Rect(0, 0, 0.5, 0.5)), // sword
    new Sprite(engine, iconAtlasTexture, new Rect(0.5, 0, 0.5, 0.5)), // heart
    new Sprite(engine, iconAtlasTexture, new Rect(0, 0.5, 0.5, 0.5)), // bolt
    new Sprite(engine, iconAtlasTexture, new Rect(0.5, 0.5, 0.5, 0.5)) // gem
  ];

  // 128×72 = 9216 buttons → 18432 sub-elements
  const cols = 128;
  const rows = 72;
  const buttonW = 7;
  const buttonH = 6;
  const gapX = 9;
  const gapY = 8;
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
      iconT.size.set(buttonW * 0.55, buttonH * 0.55);
      const iconImg = icon.addComponent(Image);
      iconImg.sprite = iconSprites[(r + c) % 4];
      iconImg.color = new Color(1, 1, 1, 1);
    }
  }

  engine.run();
});

// Vertical gradient panel with double border (atlas-style game button background)
function makeGradientPanel(engine: WebGLEngine): Texture2D {
  const size = 64;
  const tex = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
  const data = new Uint8Array(size * size * 4);
  // Base palette: deep navy → electric blue gradient
  const top = [70, 130, 240];
  const bottom = [25, 55, 130];
  const outerBorder = [12, 25, 60];
  const innerHighlight = [180, 220, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / (size - 1);
      // Vertical gradient
      let r = top[0] * (1 - t) + bottom[0] * t;
      let g = top[1] * (1 - t) + bottom[1] * t;
      let b = top[2] * (1 - t) + bottom[2] * t;

      // Outer 2px border
      if (x < 2 || x >= size - 2 || y < 2 || y >= size - 2) {
        r = outerBorder[0];
        g = outerBorder[1];
        b = outerBorder[2];
      }
      // Inner 1px highlight on top edge
      else if (y < 4 && x >= 2 && x < size - 2) {
        r = (r + innerHighlight[0]) * 0.5;
        g = (g + innerHighlight[1]) * 0.5;
        b = (b + innerHighlight[2]) * 0.5;
      }

      data[i] = r | 0;
      data[i + 1] = g | 0;
      data[i + 2] = b | 0;
      data[i + 3] = 255;
    }
  }
  tex.setPixelBuffer(data);
  return tex;
}

// 64×64 atlas with 4 icons in 2×2 grid (32×32 each), transparent background
function makeIconAtlas(engine: WebGLEngine): Texture2D {
  const cellSize = 32;
  const atlasSize = cellSize * 2;
  const tex = new Texture2D(engine, atlasSize, atlasSize, TextureFormat.R8G8B8A8, false);
  const data = new Uint8Array(atlasSize * atlasSize * 4);

  const writePixel = (cx: number, cy: number, lx: number, ly: number, r: number, g: number, b: number, a: number) => {
    const x = cx * cellSize + lx;
    const y = cy * cellSize + ly;
    if (x < 0 || x >= atlasSize || y < 0 || y >= atlasSize) return;
    const i = (y * atlasSize + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  };

  // Cell (0, 0): sword icon (silver blade + gold hilt)
  for (let y = 0; y < cellSize; y++) {
    for (let x = 0; x < cellSize; x++) {
      const cx = cellSize / 2 - 0.5;
      const cy = cellSize / 2;
      const dx = x - cx;
      const dy = y - cy;
      // diagonal blade strip
      const along = (dx + dy) * 0.7071;
      const across = (dx - dy) * 0.7071;
      const inBlade = Math.abs(across) < 2 && along > -10 && along < 8;
      const inHilt = Math.abs(across) < 5 && along >= 8 && along < 11;
      const inGuard = Math.abs(across) < 7 && Math.abs(along - 7.5) < 1;
      if (inBlade) writePixel(0, 0, x, y, 220, 230, 240, 255);
      else if (inHilt) writePixel(0, 0, x, y, 200, 150, 50, 255);
      else if (inGuard) writePixel(0, 0, x, y, 150, 110, 30, 255);
    }
  }

  // Cell (1, 0): heart icon
  for (let y = 0; y < cellSize; y++) {
    for (let x = 0; x < cellSize; x++) {
      // Heart equation: ((x²+y²-1)³ - x²y³) <= 0, with proper scaling
      const nx = (x - cellSize / 2) / (cellSize / 2.5);
      const ny = -(y - cellSize / 2.2) / (cellSize / 2.5);
      const v = Math.pow(nx * nx + ny * ny - 1, 3) - nx * nx * Math.pow(ny, 3);
      if (v <= 0) {
        // Soft red gradient
        const t = (ny + 0.5) * 0.5;
        const r = (235 - t * 30) | 0;
        const g = (50 + t * 30) | 0;
        const b = (70 + t * 20) | 0;
        writePixel(1, 0, x, y, r, g, b, 255);
      }
    }
  }

  // Cell (0, 1): lightning bolt (zigzag)
  const boltPath: [number, number][] = [
    [16, 4],
    [10, 16],
    [14, 16],
    [11, 28],
    [22, 14],
    [17, 14],
    [21, 4]
  ];
  for (let y = 0; y < cellSize; y++) {
    for (let x = 0; x < cellSize; x++) {
      // Point-in-polygon
      let inside = false;
      for (let i = 0, j = boltPath.length - 1; i < boltPath.length; j = i++) {
        const [xi, yi] = boltPath[i];
        const [xj, yj] = boltPath[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) writePixel(0, 1, x, y, 255, 215, 60, 255);
    }
  }

  // Cell (1, 1): gem (diamond shape with highlight)
  for (let y = 0; y < cellSize; y++) {
    for (let x = 0; x < cellSize; x++) {
      const cx = cellSize / 2;
      const cy = cellSize / 2;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      // Diamond: |dx| + |dy| < r
      if (dx + dy < cellSize * 0.4) {
        // Cyan with white highlight at top-left
        const high = Math.max(0, 1 - ((x - cx + 6) ** 2 + (y - cy + 6) ** 2) / 50);
        const baseR = 80;
        const baseG = 220;
        const baseB = 230;
        const r = (baseR + (255 - baseR) * high) | 0;
        const g = (baseG + (255 - baseG) * high) | 0;
        const b = (baseB + (255 - baseB) * high) | 0;
        writePixel(1, 1, x, y, r, g, b, 255);
      }
    }
  }

  tex.setPixelBuffer(data);
  return tex;
}
