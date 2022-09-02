import {
  Camera,
  CameraClearFlags,
  Canvas,
  Engine,
  IHardwareRenderer,
  IPlatformTexture2D,
  RenderTarget,
  SpriteElement,
  SpriteRenderer,
  Texture2D
} from "@oasis-engine/core";
import { Color, Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { Canvas2dCanvas } from "./Canvas2dCanvas";
import { CanvasCapability } from "./CanvasCapability";
import { CanvasTexture2D } from "./CanvasTexture2D";

export class CanvasRenderer implements IHardwareRenderer {
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();
  private static _tempVec32: Vector3 = new Vector3();
  private static _tempVec33: Vector3 = new Vector3();
  private static _tempVec34: Vector3 = new Vector3();
  private static _tempQuat: Quaternion = new Quaternion();

  private _ctx: CanvasRenderingContext2D;
  private _capability: CanvasCapability;
  private _webCanvas: Canvas2dCanvas;

  /**
   * 2D Context
   */
  get ctx() {
    return this._ctx;
  }

  get isWebGL2() {
    return false;
  }

  get capability() {
    return this._capability;
  }

  init(canvas: Canvas) {
    const webCanvas = (this._webCanvas = (canvas as Canvas2dCanvas)._webCanvas);
    this._ctx = webCanvas.getContext("2d");
    this._capability = new CanvasCapability(this);
  }

  viewport(x: number, y: number, width: number, height: number): void {}

  activeRenderTarget(renderTarget: RenderTarget, camera: Camera, mipLevel: number) {}

  clearRenderTarget(engine: Engine, clearFlags: CameraClearFlags, clearColor: Color) {
    const { ctx } = this;
    const { width, height } = this._webCanvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(
      ${Math.floor(255 * clearColor.r)},
      ${Math.floor(255 * clearColor.g)},
      ${Math.floor(255 * clearColor.b)},
      ${Math.floor(255 * clearColor.a)})`;
    ctx.clearRect(0, 0, width, height);
    ctx.fillRect(0, 0, width, height);
  }

  drawElement(element: SpriteElement, camera: Camera) {
    const spriteRenderer = <SpriteRenderer>element.component;
    const { sprite } = spriteRenderer;
    // @ts-ignore
    const image = sprite.texture._platformTexture._canvasTexture;

    const transform = spriteRenderer.entity.transform;
    const worldMatrix = transform.worldMatrix;
    const translate = CanvasRenderer._tempVec30;
    const quat = CanvasRenderer._tempQuat;
    const scale = CanvasRenderer._tempVec31;
    worldMatrix.decompose(translate, quat, scale);
    const euler = CanvasRenderer._tempVec32;
    quat.toEuler(euler);
    const ratio = (this._webCanvas.height * 0.5) / camera.orthographicSize;
    const offsetX = translate.x * ratio;
    const offsetY = translate.y * ratio;
    camera.worldToScreenPoint(translate, translate);

    const { ctx } = this;
    const { x, y } = translate;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(x, y);
    ctx.rotate(-euler.z);
    ctx.scale(scale.x, scale.y);

    const { region } = sprite;
    const { width, height } = image;
    const regionHeight = region.height;
    const sx = region.x * width;
    const sy = (1 - region.y - regionHeight) * height;
    const sWidth = region.width * width;
    const sHeight = regionHeight * height;

    const halfWidth = spriteRenderer.width * 0.5;
    const halfHeight = spriteRenderer.height * 0.5;
    const ltVec3 = CanvasRenderer._tempVec33;
    ltVec3.set(-halfWidth, halfHeight, 0);
    camera.worldToScreenPoint(ltVec3, ltVec3);
    const rbVec3 = CanvasRenderer._tempVec34;
    rbVec3.set(halfWidth, -halfHeight, 0);
    camera.worldToScreenPoint(rbVec3, rbVec3);
    const { x: ltX, y: ltY } = ltVec3;

    ctx.drawImage(image, sx, sy, sWidth, sHeight, ltX - x + offsetX, ltY - y - offsetY, rbVec3.x - ltX, rbVec3.y - ltY);
  }

  createPlatformTexture2D(texture2D: Texture2D): IPlatformTexture2D {
    return new CanvasTexture2D(this, texture2D);
  }
}
