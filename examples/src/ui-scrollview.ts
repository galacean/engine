/**
 * @title UI ScrollView
 * @category UI
 */
import {
  Camera,
  Color,
  Entity,
  Script,
  Sprite,
  Texture2D,
  TextureFormat,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import {
  CanvasRenderMode,
  Image,
  RectMask2D,
  ScrollView,
  ScrollViewMode,
  Text,
  UICanvas,
  UITransform
} from "@galacean/engine-ui";

async function main() {
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());

  const scene = engine.sceneManager.activeScene;
  const root = scene.createRootEntity("Root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  cameraEntity.addComponent(Camera);

  const canvasEntity = root.createChild("UICanvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  uiCanvas.referenceResolutionPerUnit = 100;
  uiCanvas.referenceResolution.set(800, 600);

  const solidSprite = createSolidSprite(engine);

  // --- Viewport ---
  const viewportEntity = canvasEntity.createChild("Viewport");
  const viewportTransform = viewportEntity.transform as UITransform;
  viewportTransform.size.set(400, 300);

  const viewportBg = viewportEntity.addComponent(Image);
  viewportBg.sprite = solidSprite;
  viewportBg.color.set(0.15, 0.15, 0.15, 1);
  viewportBg.raycastEnabled = true;

  const rectMask = viewportEntity.addComponent(RectMask2D);
  rectMask.alphaClip = true;

  // --- Content (child of viewport) ---
  const cols = 4;
  const rows = 3;
  const tileW = 180;
  const tileH = 180;
  const gap = 10;
  const contentW = cols * (tileW + gap) - gap;
  const contentH = rows * (tileH + gap) - gap;

  const contentEntity = viewportEntity.createChild("Content");
  const contentTransform = contentEntity.transform as UITransform;
  contentTransform.size.set(contentW, contentH);

  // --- ScrollView script on viewport ---
  const scrollView = viewportEntity.addComponent(ScrollView);
  scrollView.mode = ScrollViewMode.VerticalAndHorizontal;
  scrollView.viewport = viewportEntity;
  scrollView.content = contentEntity;

  // --- Tiles ---
  const colors = [
    new Color(0.91, 0.3, 0.24, 1),
    new Color(0.16, 0.5, 0.73, 1),
    new Color(0.18, 0.8, 0.44, 1),
    new Color(0.95, 0.61, 0.07, 1),
    new Color(0.56, 0.27, 0.68, 1),
    new Color(0.2, 0.6, 0.86, 1),
    new Color(0.83, 0.33, 0.33, 1),
    new Color(0.1, 0.74, 0.61, 1),
    new Color(0.93, 0.78, 0.0, 1),
    new Color(0.5, 0.55, 0.53, 1),
    new Color(0.61, 0.35, 0.71, 1),
    new Color(0.2, 0.29, 0.37, 1)
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const tileEntity = contentEntity.createChild(`Tile_${idx}`);
      const tileTransform = tileEntity.transform as UITransform;
      tileTransform.size.set(tileW, tileH);

      // Layout from top-left of content
      const x = c * (tileW + gap) - contentW / 2 + tileW / 2;
      const y = contentH / 2 - tileH / 2 - r * (tileH + gap);
      tileTransform.setPosition(x, y, 0);

      const tileImage = tileEntity.addComponent(Image);
      tileImage.sprite = solidSprite;
      tileImage.color = colors[idx % colors.length];
      tileImage.raycastEnabled = false;

      const labelEntity = tileEntity.createChild("Label");
      (labelEntity.transform as UITransform).size.set(tileW, tileH);
      const label = labelEntity.addComponent(Text);
      label.text = `${idx + 1}`;
      label.fontSize = 36;
      label.color = new Color(1, 1, 1, 1);
      label.raycastEnabled = false;
    }
  }

  // --- Title ---
  const titleEntity = canvasEntity.createChild("Title");
  const titleTransform = titleEntity.transform as UITransform;
  titleTransform.size.set(400, 50);
  titleTransform.setPosition(0, 210, 0);
  const title = titleEntity.addComponent(Text);
  title.text = "Drag to scroll";
  title.fontSize = 28;
  title.color = new Color(1, 1, 1, 1);
  title.raycastEnabled = false;

  // Debug: log clip rect and tile world positions
  class DebugScript extends Script {
    private _logged = false;
    override onUpdate(): void {
      if (this._logged) return;
      this._logged = true;
      const debugRect = new Vector4();
      // @ts-ignore
      const hasRect = rectMask._getWorldRect(debugRect);
      console.log("RectMask2D worldRect:", hasRect, debugRect.x, debugRect.y, debugRect.z, debugRect.w);
      const firstTile = contentEntity.children[0];
      if (firstTile) {
        const wp = firstTile.transform.worldPosition;
        console.log("Tile0 worldPosition:", wp.x, wp.y, wp.z);
      }
      const vp = viewportEntity.transform.worldPosition;
      console.log("Viewport worldPosition:", vp.x, vp.y, vp.z);
      console.log("Viewport worldMatrix:", viewportTransform.worldMatrix.elements);
    }
  }
  viewportEntity.addComponent(DebugScript);

  engine.run();
}

main();

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
