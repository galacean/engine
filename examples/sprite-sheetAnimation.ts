/**
 * @title Sprite SheetAnimation
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*mLQbQZ_umdQAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  Camera,
  Script,
  Sprite,
  SpriteRenderer,
  Texture2D,
  Vector2,
  WebGLEngine,
  Transform,
} from "@galacean/engine";
import * as TWEEN from "@tweenjs/tween.js";

main();

async function main(): Promise<void> {
  // Create engine object.
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  // Create rootEntity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 15);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // Load texture and create sprite sheet animation.
  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*9nsHSpx28rAAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      const spriteEntity = rootEntity.createChild("Sprite");
      spriteEntity.addComponent(SpriteRenderer).sprite = new Sprite(
        engine,
        texture,
        null,
        null,
        null
      );
      spriteEntity.addComponent(FrameSpriteScript);
    });

  // Run engine.
  engine.run();
}

/**
 * Script for sprite sheet animation.
 */
class FrameSpriteScript extends Script {
  /** Offsets of sprite sheet animation. */
  private _regions: Vector2[];
  /** Reciprocal Of SliceWidth. */
  private _reciprocalSliceWidth: number;
  /** Reciprocal Of SliceHeight. */
  private _reciprocalSliceHeight: number;
  /** Total frames. */
  private _totalFrames: number;
  /** Frame interval time, the unit of time is ms. */
  private _frameInterval: number = 0.15;

  private _sprite: Sprite;
  private _curFrameIndex: number;
  private _cumulativeTime: number = 0;
  private _birdTransform: Transform;

  onAwake(): void {
    // Sprite sheet animation pictures have 3 rows and 1 columns, if you modify the picture, please modify this.
    const row = 3;
    const col = 1;
    const reciprocalSliceWidth = 1 / row;
    const reciprocalSliceHeight = 1 / col;
    const regions = new Array<Vector2>();
    for (let i = 0; i < col; i++) {
      const y = i * reciprocalSliceHeight;
      for (let j = 0; j < row; j++) {
        regions.push(new Vector2(j * reciprocalSliceWidth, y));
      }
    }

    const { entity } = this;
    this._sprite = entity.getComponent(SpriteRenderer).sprite;
    this._regions = regions;
    this._reciprocalSliceWidth = reciprocalSliceWidth;
    this._reciprocalSliceHeight = reciprocalSliceHeight;
    this._totalFrames = row * col;
    this._setFrameIndex(0);

    this._birdTransform = entity.transform;
    new TWEEN.Tween(this)
      .to({ birdPosY: 0.4 }, 380)
      .repeat(Infinity)
      .yoyo(true)
      .easing(TWEEN.Easing.Sinusoidal.InOut)
      .start();
  }

  onUpdate(deltaTime: number): void {
    // Update TWEEN
    TWEEN.update();

    const frameInterval = this._frameInterval;
    this._cumulativeTime += deltaTime;
    if (this._cumulativeTime >= frameInterval) {
      // Need update frameIndex.
      const addFrameCount = Math.floor(this._cumulativeTime / frameInterval);
      this._cumulativeTime -= addFrameCount * frameInterval;
      this._setFrameIndex(
        (this._curFrameIndex + addFrameCount) % this._totalFrames
      );
    }
  }

  private _setFrameIndex(frameIndex: number): void {
    if (this._curFrameIndex !== frameIndex) {
      this._curFrameIndex = frameIndex;
      const frameInfo = this._regions[frameIndex];
      const region = this._sprite.region;
      region.set(
        frameInfo.x,
        frameInfo.y,
        this._reciprocalSliceWidth,
        this._reciprocalSliceHeight
      );
      this._sprite.region = region;
    }
  }

  set birdPosY(val) {
    const transform = this._birdTransform;
    const position = transform.position;
    position.y = val;
    transform.position = position;
  }

  get birdPosY() {
    return this._birdTransform.position.y;
  }
}
