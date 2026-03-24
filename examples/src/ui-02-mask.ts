/**
 * @title UI 02 - Mask 遮罩
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
import { CanvasRenderMode, Image, Mask, UICanvas, UITransform } from "@galacean/engine-ui";

function createCircleTexture(engine: WebGLEngine, size: number): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;
  const radius = center - 2;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  return texture;
}

function createGradientTexture(engine: WebGLEngine, size: number): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, "#e74c3c");
  gradient.addColorStop(0.5, "#f39c12");
  gradient.addColorStop(1, "#2ecc71");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  return texture;
}

function createCheckerTexture(engine: WebGLEngine, size: number): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const tileSize = size / 8;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#3498db" : "#2c3e50";
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  return texture;
}

class RotateScript extends Script {
  speed = 30;
  onUpdate(dt: number) {
    this.entity.transform.rotate(new Vector3(0, 0, this.speed * dt));
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
  const canvas = canvasEntity.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  canvas.referenceResolution = new Vector2(800, 600);
  canvas.renderCamera = camera;

  const circleTexture = createCircleTexture(engine, 256);
  const gradientTexture = createGradientTexture(engine, 256);
  const checkerTexture = createCheckerTexture(engine, 256);

  // --- Example 1: Circle mask clipping a gradient ---
  const mask1Entity = canvasEntity.createChild("CircleMask");
  const mask1Transform = <UITransform>mask1Entity.transform;
  mask1Transform.size = new Vector2(200, 200);
  mask1Entity.transform.setPosition(-200, 50, 0);
  const mask1 = mask1Entity.addComponent(Mask);
  mask1.sprite = new Sprite(engine, circleTexture);

  const content1 = mask1Entity.createChild("Content");
  const content1Transform = <UITransform>content1.transform;
  content1Transform.size = new Vector2(250, 250);
  const content1Image = content1.addComponent(Image);
  content1Image.sprite = new Sprite(engine, gradientTexture);
  content1.addComponent(RotateScript).speed = 20;

  // --- Example 2: Circle mask clipping a checker pattern ---
  const mask2Entity = canvasEntity.createChild("CheckerMask");
  const mask2Transform = <UITransform>mask2Entity.transform;
  mask2Transform.size = new Vector2(200, 200);
  mask2Entity.transform.setPosition(200, 50, 0);
  const mask2 = mask2Entity.addComponent(Mask);
  mask2.sprite = new Sprite(engine, circleTexture);

  const content2 = mask2Entity.createChild("Content");
  const content2Transform = <UITransform>content2.transform;
  content2Transform.size = new Vector2(300, 300);
  const content2Image = content2.addComponent(Image);
  content2Image.sprite = new Sprite(engine, checkerTexture);
  content2.addComponent(RotateScript).speed = -15;

  engine.run();

  console.log("UI 02 - Mask 遮罩");
  console.log("- 左: 圆形 Mask 裁剪渐变图片 (旋转)");
  console.log("- 右: 圆形 Mask 裁剪棋盘格 (旋转)");
  console.log("- 子节点自动被 Mask 裁剪，无需手动配置 maskInteraction");
});
