/**
 * @title UI Batch Order
 * @category UI
 * @description Regression guard for the canvas hierarchy-order bug introduced when
 *   SubRenderElement was flattened into RenderElement: canvas sub-elements entered
 *   the main transparent queue directly and could be shuffled by unstable quicksort
 *   under equal (priority, distance), making `text` render below `bg` on some buttons.
 *   Fixed by canvas-internal batching + subDistancePriority tiebreaker.
 *   This case lays out a 4×3 grid of (bg + text) buttons; if hierarchy order ever
 *   breaks again, the green text would be hidden behind red bg in the screenshot.
 */
import { Camera, Color, Sprite, Texture2D, TextureFormat, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, registerGUI, UICanvas, UITransform } from "@galacean/engine-ui";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

registerGUI();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.setAutoResolution(2);

  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity("root");

  // Camera (ScreenSpaceCamera mode is required: ScreenSpaceOverlay UI renders in a
  // separate overlay pass that bypasses camera.render(), so initScreenshot's
  // off-screen render-target won't capture it.)
  const cameraEntity = root.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  const camera = cameraEntity.addComponent(Camera);

  // Canvas
  const canvasEntity = root.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
  canvas.renderCamera = camera;
  canvas.referenceResolution.set(1280, 720);

  // Two solid-color textures → distinct materials, so bg/text are batch-incompatible
  const bgTex = createSolidTexture(engine, 64, 64, [255, 80, 80, 255]); // red
  const textTex = createSolidTexture(engine, 64, 64, [80, 255, 80, 255]); // green
  const bgSprite = new Sprite(engine, bgTex);
  const textSprite = new Sprite(engine, textTex);

  // Build a 4×3 grid of buttons; each button = bg (red) + text (green) overlapping.
  // Hierarchy creation order: bg0, text0, bg1, text1, ... — text must paint over bg.
  // If sort breaks per-button order, green will be hidden under red somewhere.
  const cols = 4;
  const rows = 3;
  const cellW = 180;
  const cellH = 100;
  const startX = -((cols - 1) * cellW) / 2;
  const startY = -((rows - 1) * cellH) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * cellW;
      const y = startY + r * cellH;

      const bgEntity = canvasEntity.createChild(`bg-${r}-${c}`);
      const bgTransform = bgEntity.transform as UITransform;
      bgTransform.position.set(x, y, 0);
      bgTransform.size.set(140, 60);
      const bgImage = bgEntity.addComponent(Image);
      bgImage.sprite = bgSprite;
      bgImage.color = new Color(1, 1, 1, 1);

      const textEntity = canvasEntity.createChild(`text-${r}-${c}`);
      const textTransform = textEntity.transform as UITransform;
      textTransform.position.set(x, y, 0);
      textTransform.size.set(80, 30);
      const textImage = textEntity.addComponent(Image);
      textImage.sprite = textSprite;
      textImage.color = new Color(1, 1, 1, 1);
    }
  }

  updateForE2E(engine);
  initScreenshot(engine, camera);
});

function createSolidTexture(engine: WebGLEngine, w: number, h: number, rgba: number[]): Texture2D {
  const tex = new Texture2D(engine, w, h, TextureFormat.R8G8B8A8, false);
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  tex.setPixelBuffer(data);
  return tex;
}
