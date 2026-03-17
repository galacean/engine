/**
 * @title UI Mask Raycast
 * @category UI
 */
import {
  Camera,
  Color,
  Entity,
  PointerEventData,
  Script,
  Sprite,
  SpriteMaskInteraction,
  Texture2D,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { CanvasRenderMode, Image, Mask, Text, UICanvas, UITransform } from "@galacean/engine-ui";

class ClickCounter extends Script {
  label: string = "";
  counterText: Text = null;
  private _count: number = 0;

  override onPointerClick(_eventData: PointerEventData): void {
    this._count += 1;
    if (this.counterText) {
      this.counterText.text = `${this.label}: ${this._count}`;
    }
  }
}

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
  uiCanvas.referenceResolution.set(1000, 700);

  const solidSprite = createSolidSprite(engine);
  const circleSprite = createCircleSprite(engine, 256);

  const panelSize = { width: 760, height: 420 };

  const outsideEntity = canvasEntity.createChild("OutsidePanel");
  const outsideImage = outsideEntity.addComponent(Image);
  (outsideEntity.transform as UITransform).size.set(panelSize.width, panelSize.height);
  outsideImage.sprite = solidSprite;
  outsideImage.color.set(0.2, 0.56, 0.96, 0.95);
  outsideImage.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;

  const insideEntity = canvasEntity.createChild("InsidePanel");
  const insideImage = insideEntity.addComponent(Image);
  (insideEntity.transform as UITransform).size.set(panelSize.width, panelSize.height);
  insideImage.sprite = solidSprite;
  insideImage.color.set(0.96, 0.36, 0.28, 0.95);
  insideImage.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;

  const maskEntity = canvasEntity.createChild("Mask");
  const maskTransform = maskEntity.transform as UITransform;
  maskTransform.size.set(280, 280);
  const mask = maskEntity.addComponent(Mask);
  mask.sprite = circleSprite;
  mask.alphaCutoff = 0.1;

  const maskPreviewEntity = maskEntity.createChild("MaskPreview");
  const maskPreview = maskPreviewEntity.addComponent(Image);
  (maskPreviewEntity.transform as UITransform).size.set(280, 280);
  maskPreview.sprite = circleSprite;
  maskPreview.color.set(1, 1, 1, 0.22);
  maskPreview.raycastEnabled = false;

  createLabel(canvasEntity, "Title", "UI Mask + Raycast", 300, 44, new Color(1, 1, 1, 1));
  createLabel(
    canvasEntity,
    "Hint",
    "Click red center (inside mask) and blue edge (outside mask).",
    250,
    24,
    new Color(1, 1, 1, 0.95)
  );

  const insideCountLabel = createLabel(canvasEntity, "InsideCount", "Inside hits: 0", -260, 30, new Color(1, 0.85, 0.8, 1));
  const outsideCountLabel = createLabel(
    canvasEntity,
    "OutsideCount",
    "Outside hits: 0",
    -305,
    30,
    new Color(0.78, 0.9, 1, 1)
  );

  const insideCounter = insideEntity.addComponent(ClickCounter);
  insideCounter.label = "Inside hits";
  insideCounter.counterText = insideCountLabel;

  const outsideCounter = outsideEntity.addComponent(ClickCounter);
  outsideCounter.label = "Outside hits";
  outsideCounter.counterText = outsideCountLabel;

  engine.run();
}

main();

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}

function createCircleSprite(engine: WebGLEngine, size: number): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create canvas 2D context.");
  }

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(size * 0.5, size * 0.5, size * 0.46, 0, Math.PI * 2);
  context.closePath();
  context.fill();

  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
  texture.setImageSource(canvas);
  return new Sprite(engine, texture);
}

function createLabel(
  parent: Entity,
  name: string,
  content: string,
  y: number,
  fontSize: number,
  color: Color
): Text {
  const entity = parent.createChild(name);
  const transform = entity.transform as UITransform;
  transform.size.set(980, 64);
  transform.setPosition(0, y, 0);

  const label = entity.addComponent(Text);
  label.text = content;
  label.fontSize = fontSize;
  label.color = color;
  label.raycastEnabled = false;

  return label;
}
