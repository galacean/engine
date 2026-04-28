/**
 * @title 2D 01 - SpriteMask 遮罩
 * @category 2D 教程
 */
import {
  Camera,
  Color,
  Entity,
  Logger,
  Script,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

function createCircleTexture(engine: WebGLEngine, size: number): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;
  ctx.beginPath();
  ctx.arc(center, center, center - 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  return texture;
}

function createColorTexture(engine: WebGLEngine, color: string, size: number = 128): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  const texture = new Texture2D(engine, size, size);
  texture.setImageSource(canvas);
  texture.generateMipmaps();
  return texture;
}

class OscillateScript extends Script {
  amplitude = 2;
  speed = 1;
  private _time = 0;
  private _startX = 0;

  onStart() {
    this._startX = this.entity.transform.position.x;
  }

  onUpdate(dt: number) {
    this._time += dt;
    const x = this._startX + Math.sin(this._time * this.speed) * this.amplitude;
    const pos = this.entity.transform.position;
    this.entity.transform.setPosition(x, pos.y, pos.z);
  }
}

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  cameraEntity.addComponent(Camera);

  const circleTexture = createCircleTexture(engine, 256);
  const redTexture = createColorTexture(engine, "#e74c3c");
  const blueTexture = createColorTexture(engine, "#3498db");
  const greenTexture = createColorTexture(engine, "#2ecc71");

  // --- SpriteMask (circle shape, oscillating) ---
  const maskEntity = rootEntity.createChild("SpriteMask");
  maskEntity.transform.setPosition(0, 0, 0);
  const mask = maskEntity.addComponent(SpriteMask);
  mask.sprite = new Sprite(engine, circleTexture);
  mask.alphaCutoff = 0.5;
  mask.influenceLayers = SpriteMaskLayer.Layer0;
  mask.width = 3;
  mask.height = 3;
  const oscillate = maskEntity.addComponent(OscillateScript);
  oscillate.amplitude = 1.5;
  oscillate.speed = 2;

  // --- Sprite: VisibleInsideMask ---
  const insideEntity = rootEntity.createChild("InsideMask");
  insideEntity.transform.setPosition(-2, 0, 0);
  const insideRenderer = insideEntity.addComponent(SpriteRenderer);
  insideRenderer.sprite = new Sprite(engine, redTexture);
  insideRenderer.width = 3;
  insideRenderer.height = 3;
  insideRenderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
  insideRenderer.maskLayer = SpriteMaskLayer.Layer0;

  // --- Sprite: VisibleOutsideMask ---
  const outsideEntity = rootEntity.createChild("OutsideMask");
  outsideEntity.transform.setPosition(2, 0, 0);
  const outsideRenderer = outsideEntity.addComponent(SpriteRenderer);
  outsideRenderer.sprite = new Sprite(engine, blueTexture);
  outsideRenderer.width = 3;
  outsideRenderer.height = 3;
  outsideRenderer.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
  outsideRenderer.maskLayer = SpriteMaskLayer.Layer0;

  // --- Sprite: No mask interaction (always visible) ---
  const normalEntity = rootEntity.createChild("NoMask");
  normalEntity.transform.setPosition(0, -3, 0);
  const normalRenderer = normalEntity.addComponent(SpriteRenderer);
  normalRenderer.sprite = new Sprite(engine, greenTexture);
  normalRenderer.width = 2;
  normalRenderer.height = 2;
  normalRenderer.color = new Color(1, 1, 1, 0.8);

  engine.run();

  console.log("2D 01 - SpriteMask 遮罩");
  console.log("- 圆形 SpriteMask 左右摆动");
  console.log("- 红色: VisibleInsideMask (只在 mask 内可见)");
  console.log("- 蓝色: VisibleOutsideMask (只在 mask 外可见)");
  console.log("- 绿色: 无遮罩交互 (始终可见)");
  console.log("- 2D 遮罩使用 maskInteraction + maskLayer，与 UI 层级式遮罩不同");
});
