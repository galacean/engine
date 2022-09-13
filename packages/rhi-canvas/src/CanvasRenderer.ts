import {
  Camera,
  CameraClearFlags,
  Canvas,
  Engine,
  IHardwareRenderer,
  IPlatformTexture2D,
  Renderer,
  RenderTarget,
  SpriteElement,
  TextRenderElement,
  SpriteRenderer,
  TextRenderer,
  Texture2D
} from "@oasis-engine/core";
import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Canvas2dCanvas } from "./Canvas2dCanvas";
import { CanvasCapability } from "./CanvasCapability";
import { CanvasTexture2D } from "./CanvasTexture2D";

export class CanvasRenderer implements IHardwareRenderer {
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();
  private static _tempVec32: Vector3 = new Vector3();
  private static _tempVec33: Vector3 = new Vector3();
  private static _tempVec34: Vector3 = new Vector3();
  private static _tempVec4: Vector4 = new Vector4();
  private static _tempQuat: Quaternion = new Quaternion();
  private static _PI: number = Math.PI;
  private static _doublePI: number = Math.PI * 2;
  private static _reciprocalPI: number = 1.0 / Math.PI;

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

  drawElement(element: SpriteElement | TextRenderElement, camera: Camera) {
    const { component } = element;
    if (component instanceof SpriteRenderer) {
      this._drawImage(<SpriteElement>element, camera);
    } else if (component instanceof TextRenderer) {
      const { charElements } = <TextRenderElement>element;
      for (let i = 0, l = charElements.length; i < l; ++i) {
        this._drawText(charElements[i], camera);
      }
    }
  }

  createPlatformTexture2D(texture2D: Texture2D): IPlatformTexture2D {
    return new CanvasTexture2D(this, texture2D);
  }

  private _drawImage(element: SpriteElement, camera: Camera) {
    const renderer = <SpriteRenderer>element.component;
    const { sprite, width, height } = renderer;
    const { renderData } = element;
    const { uvs } = renderData;
    const { pivot } = sprite;
    // @ts-ignore
    const image = sprite.texture._platformTexture._canvasTexture;
    const pivotWidth = pivot.x * width;
    const pivotHeight = pivot.y * height;
    const vec4 = CanvasRenderer._tempVec4;
    vec4.set(-pivotWidth, height - pivotHeight, width - pivotWidth, -pivotHeight);
    this._draw(camera, renderer, image, uvs[2], uvs[1], vec4, renderData.color);
  }

  private _drawText(element: SpriteElement, camera: Camera) {
    const renderer = <TextRenderer>element.component;
    const { renderData } = element;
    const { uvs } = renderData;
    // @ts-ignore
    const image = element.texture._platformTexture._canvasTexture;
    const vec4 = CanvasRenderer._tempVec4;
    // @ts-ignore
    vec4.copyFrom(renderer._charRenderDatas[element.dataIndex].localPositions);
    this._draw(camera, renderer, image, uvs[0], uvs[2], vec4, renderData.color);
  }

  private _draw(
    camera: Camera,
    renderer: Renderer,
    image: HTMLCanvasElement,
    ltUV: Vector2,
    rbUV: Vector2,
    vec4: Vector4,
    color: Color
  ) {
    const transform = renderer.entity.transform;
    const translate = CanvasRenderer._tempVec30;
    const quat = CanvasRenderer._tempQuat;
    const scale = CanvasRenderer._tempVec31;
    translate.copyFrom(transform.worldPosition);
    quat.copyFrom(transform.worldRotationQuaternion);
    scale.copyFrom(transform.lossyWorldScale);

    const euler = CanvasRenderer._tempVec32;
    quat.toEuler(euler);
    const ratio = (this._webCanvas.height * 0.5) / camera.orthographicSize;
    const offsetX = translate.x * ratio;
    const offsetY = translate.y * ratio;
    camera.worldToScreenPoint(translate, translate);

    // Handle transform.
    const { ctx } = this;
    const { x, y } = translate;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(x, y);
    ctx.rotate(-euler.z);
    // @ts-ignore
    const scaleX = renderer.flipX ? -scale.x : scale.x;
    // @ts-ignore
    const scaleY = renderer.flipY ? -scale.y : scale.y;
    // Handle rotation around axis X and Y.
    ctx.scale(scaleX * this._calculateScaleByRadian(euler.y), scaleY * this._calculateScaleByRadian(euler.x));

    // Handle UV.
    const { width, height } = image;
    const sx = ltUV.x * width;
    const sy = ltUV.y * height;
    const sWidth = (rbUV.x - ltUV.x) * width;
    const sHeight = (rbUV.y - ltUV.y) * height;

    const ltVec3 = CanvasRenderer._tempVec33;
    ltVec3.set(vec4.x, vec4.y, 0);
    camera.worldToScreenPoint(ltVec3, ltVec3);
    const rbVec3 = CanvasRenderer._tempVec34;
    rbVec3.set(vec4.z, vec4.w, 0);
    camera.worldToScreenPoint(rbVec3, rbVec3);
    const { x: ltX, y: ltY } = ltVec3;

    ctx.globalAlpha = color.a;
    ctx.drawImage(image, sx, sy, sWidth, sHeight, ltX - x + offsetX, ltY - y - offsetY, rbVec3.x - ltX, rbVec3.y - ltY);
    ctx.globalAlpha = 1.0;
  }

  private _calculateScaleByRadian(radian: number): number {
    const { _PI: PI } = CanvasRenderer;
    radian = Math.abs(radian % CanvasRenderer._doublePI);
    let scale = 1;
    if (radian <= PI) {
      const t = radian * CanvasRenderer._reciprocalPI;
      scale = 1 - 2 * t;
    } else {
      const t = (radian - PI) * CanvasRenderer._reciprocalPI;
      scale = -1 + 2 * t;
    }
    return scale;
  }
}
