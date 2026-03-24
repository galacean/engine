/**
 * @title UI 03 - RectMask2D 矩形裁剪
 * @category UI 教程
 */
import {
  Camera,
  Color,
  Entity,
  Logger,
  Script,
  Sprite,
  Texture2D,
  Vector2,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { CanvasRenderMode, Image, RectMask2D, Text, UICanvas, UITransform } from "@galacean/engine-ui";

function createColorTexture(engine: WebGLEngine, r: number, g: number, b: number): Texture2D {
  const texture = new Texture2D(engine, 4, 4);
  const data = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 64; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  texture.setPixelBuffer(data);
  return texture;
}

function createGradientTexture(engine: WebGLEngine, size: number): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#e74c3c");
  gradient.addColorStop(0.25, "#f39c12");
  gradient.addColorStop(0.5, "#2ecc71");
  gradient.addColorStop(0.75, "#3498db");
  gradient.addColorStop(1, "#9b59b6");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  return texture;
}

/** Scrolls content up and down to show clipping effect */
class ScrollScript extends Script {
  speed = 60;
  range = 100;
  private _time = 0;

  onUpdate(dt: number) {
    this._time += dt;
    const y = Math.sin(this._time * this.speed * 0.02) * this.range;
    const pos = this.entity.transform.position;
    this.entity.transform.setPosition(pos.x, y, pos.z);
  }
}

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  const canvasEntity = rootEntity.createChild("Canvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  uiCanvas.referenceResolution = new Vector2(800, 600);
  uiCanvas.renderCamera = camera;

  const solidTexture = createColorTexture(engine, 255, 255, 255);
  const gradientTexture = createGradientTexture(engine, 256);

  // ========== Left: Hard clip (alphaClip = true) ==========
  const leftFrame = canvasEntity.createChild("LeftFrame");
  (<UITransform>leftFrame.transform).size = new Vector2(240, 300);
  leftFrame.transform.setPosition(-180, 20, 0);
  const leftBg = leftFrame.addComponent(Image);
  leftBg.sprite = new Sprite(engine, solidTexture);
  leftBg.color = new Color(0.12, 0.14, 0.18, 1);

  const leftViewport = leftFrame.createChild("Viewport");
  (<UITransform>leftViewport.transform).size = new Vector2(200, 220);
  leftViewport.transform.setPosition(0, -10, 0);
  const leftRectMask = leftViewport.addComponent(RectMask2D);
  leftRectMask.alphaClip = true;

  const leftContent = leftViewport.createChild("Content");
  (<UITransform>leftContent.transform).size = new Vector2(200, 600);
  const leftScroll = leftContent.addComponent(ScrollScript);
  leftScroll.range = 150;
  leftScroll.speed = 40;

  const tileColors = [
    new Color(0.91, 0.3, 0.24, 1),
    new Color(0.16, 0.5, 0.73, 1),
    new Color(0.18, 0.8, 0.44, 1),
    new Color(0.95, 0.61, 0.07, 1),
    new Color(0.56, 0.27, 0.68, 1),
    new Color(0.2, 0.6, 0.86, 1)
  ];
  for (let i = 0; i < 6; i++) {
    const tile = leftContent.createChild(`Tile${i}`);
    (<UITransform>tile.transform).size = new Vector2(180, 70);
    tile.transform.setPosition(0, 230 - i * 90, 0);
    const tileImg = tile.addComponent(Image);
    tileImg.sprite = new Sprite(engine, solidTexture);
    tileImg.color = tileColors[i];

    const label = tile.createChild("Label");
    (<UITransform>label.transform).size = new Vector2(160, 30);
    const text = label.addComponent(Text);
    text.text = `Item ${i + 1}`;
    text.fontSize = 20;
    text.color = new Color(1, 1, 1, 1);
  }

  const leftTitle = leftFrame.createChild("Title");
  (<UITransform>leftTitle.transform).size = new Vector2(200, 30);
  leftTitle.transform.setPosition(0, 125, 0);
  const leftTitleText = leftTitle.addComponent(Text);
  leftTitleText.text = "Hard Clip";
  leftTitleText.fontSize = 18;
  leftTitleText.color = new Color(1, 1, 1, 0.9);

  // ========== Right: Soft clip (softness > 0) ==========
  const rightFrame = canvasEntity.createChild("RightFrame");
  (<UITransform>rightFrame.transform).size = new Vector2(240, 300);
  rightFrame.transform.setPosition(180, 20, 0);
  const rightBg = rightFrame.addComponent(Image);
  rightBg.sprite = new Sprite(engine, solidTexture);
  rightBg.color = new Color(0.12, 0.14, 0.18, 1);

  const rightViewport = rightFrame.createChild("Viewport");
  (<UITransform>rightViewport.transform).size = new Vector2(200, 220);
  rightViewport.transform.setPosition(0, -10, 0);
  const rightRectMask = rightViewport.addComponent(RectMask2D);
  rightRectMask.softness = new Vector2(30, 30);

  const rightContent = rightViewport.createChild("Content");
  (<UITransform>rightContent.transform).size = new Vector2(300, 300);
  const rightImage = rightContent.addComponent(Image);
  rightImage.sprite = new Sprite(engine, gradientTexture);
  const rightScroll = rightContent.addComponent(ScrollScript);
  rightScroll.range = 60;
  rightScroll.speed = 30;

  const rightTitle = rightFrame.createChild("Title");
  (<UITransform>rightTitle.transform).size = new Vector2(200, 30);
  rightTitle.transform.setPosition(0, 125, 0);
  const rightTitleText = rightTitle.addComponent(Text);
  rightTitleText.text = "Soft Clip";
  rightTitleText.fontSize = 18;
  rightTitleText.color = new Color(1, 1, 1, 0.9);

  engine.run();

  console.log("UI 03 - RectMask2D 矩形裁剪");
  console.log("- 左: alphaClip=true, 硬裁剪 (discard), 模拟滚动列表");
  console.log("- 右: softness=(30,30), 柔和边缘裁剪, 渐变图片滚动");
  console.log("- RectMask2D 基于层级自动裁剪子节点, 使用 shader 实现");
});
