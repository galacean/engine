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
  TextRenderer,
  Texture2D
} from "@oasis-engine/core";
import { Color, Quaternion, Vector3 } from "@oasis-engine/math";
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
    const { component } = element;
    if (component instanceof SpriteRenderer) {
      this._drawImage(element, camera);
    } else if (component instanceof TextRenderer) {
      this._drawText(element, camera);
    }
  }

  createPlatformTexture2D(texture2D: Texture2D): IPlatformTexture2D {
    return new CanvasTexture2D(this, texture2D);
  }

  private _drawImage(element: SpriteElement, camera: Camera) {
    const renderer = <SpriteRenderer>element.component;
    const { sprite } = renderer;
    // @ts-ignore
    const image = sprite.texture._platformTexture._canvasTexture;

    const transform = renderer.entity.transform;
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
    const scaleX = renderer.flipX ? -scale.x : scale.x;
    const scaleY = renderer.flipY ? -scale.y : scale.y;
    // Handle rotation axis X and Y.
    const percentX = Math.abs(euler.x % (Math.PI * 2));
    let rotationScaleY = 1;
    if (percentX <= Math.PI) {
      const t = percentX / Math.PI;
      rotationScaleY = 1 - 2 * t;
    } else {
      const t = (percentX - Math.PI) / Math.PI;
      rotationScaleY = -1 + 2 * t;
    }
    const percentY = Math.abs(euler.y % (Math.PI * 2));
    let rotationScaleX = 1;
    if (percentY <= Math.PI) {
      const t = percentY / Math.PI;
      rotationScaleX = 1 - 2 * t;
    } else {
      const t = (percentY - Math.PI) / Math.PI;
      rotationScaleX = -1 + 2 * t;
    }
    ctx.scale(scaleX * rotationScaleX, scaleY * rotationScaleY);

    const { renderData } = element;
    const { uvs } = renderData;
    const { width, height } = image;
    const ltUV = uvs[2];
    const rbUV = uvs[1];
    const sx = ltUV.x * width;
    const sy = ltUV.y * height;
    const sWidth = (rbUV.x - ltUV.x) * width;
    const sHeight = (rbUV.y - ltUV.y) * height;

    const { pivot } = sprite;
    const { width: renderWidth, height: renderHeight } = renderer;
    const pivotWidth = pivot.x * renderWidth;
    const pivotHeight = pivot.y * renderHeight;
    const ltVec3 = CanvasRenderer._tempVec33;
    ltVec3.set(-pivotWidth, renderHeight - pivotHeight, 0);
    camera.worldToScreenPoint(ltVec3, ltVec3);
    const rbVec3 = CanvasRenderer._tempVec34;
    rbVec3.set(renderWidth - pivotWidth, -pivotHeight, 0);
    camera.worldToScreenPoint(rbVec3, rbVec3);
    const { x: ltX, y: ltY } = ltVec3;

    ctx.globalAlpha = renderData.color.a;
    ctx.drawImage(image, sx, sy, sWidth, sHeight, ltX - x + offsetX, ltY - y - offsetY, rbVec3.x - ltX, rbVec3.y - ltY);
    ctx.globalAlpha = 1.0;
  }

  private _drawText(element: SpriteElement, camera: Camera) {
    const { component } = element;
    // @ts-ignore
    const image = element.texture._platformTexture._canvasTexture;

    const transform = component.entity.transform;
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
    // Handle rotation axis X and Y.
    const percentX = Math.abs(euler.x % (Math.PI * 2));
    let rotationScaleY = 1;
    if (percentX <= Math.PI) {
      const t = percentX / Math.PI;
      rotationScaleY = 1 - 2 * t;
    } else {
      const t = (percentX - Math.PI) / Math.PI;
      rotationScaleY = -1 + 2 * t;
    }
    const percentY = Math.abs(euler.y % (Math.PI * 2));
    let rotationScaleX = 1;
    if (percentY <= Math.PI) {
      const t = percentY / Math.PI;
      rotationScaleX = 1 - 2 * t;
    } else {
      const t = (percentY - Math.PI) / Math.PI;
      rotationScaleX = -1 + 2 * t;
    }
    ctx.scale(scale.x, scale.y);

    const { renderData } = element;
    const { uvs } = renderData;
    const { width, height } = image;
    const ltUV = uvs[0];
    const rbUV = uvs[2];
    const sx = ltUV.x * width;
    const sy = ltUV.y * height;
    const sWidth = (rbUV.x - ltUV.x) * width;
    const sHeight = (rbUV.y - ltUV.y) * height;

    // @ts-ignore
    const positions = component._charRenderDatas[element.dataIndex].localPositions;
    const ltVec3 = CanvasRenderer._tempVec33;
    ltVec3.set(positions[0].x, positions[0].y, 0);
    camera.worldToScreenPoint(ltVec3, ltVec3);
    const rbVec3 = CanvasRenderer._tempVec34;
    rbVec3.set(positions[2].x, positions[2].y, 0);
    camera.worldToScreenPoint(rbVec3, rbVec3);
    const { x: ltX, y: ltY } = ltVec3;

    ctx.globalAlpha = renderData.color.a;
    ctx.drawImage(image, sx, sy, sWidth, sHeight, ltX - x + offsetX, ltY - y - offsetY, rbVec3.x - ltX, rbVec3.y - ltY);
    ctx.globalAlpha = 1.0;
  }
}
