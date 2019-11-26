import * as o3 from "@alipay/o3";
import { GLRenderHardware, BasicSceneRenderer } from "@alipay/o3";
import { Camera } from "./Camera";

interface Props {
  RHI?: GLRenderHardware;
  SceneRenderer?: BasicSceneRenderer;
  canvas?: string | HTMLCanvasElement;
  attributes?;
  near?: number;
  far?: number;
  left?: number;
  right?: number;
  bottom?: number;
  top?: number;
  pixelRatio?: number;
  clearMode?: number;
  clearParam?: number[];
  enableCollect?: boolean;
}

/**
 * 辅助创建正交相机，基于{@link Camera}
 *
 * @alias OrthographicCamera
 * @constructor
 */
export class OrthographicCamera extends Camera {
  public canvas: HTMLCanvasElement;
  /**
   * 相机近裁剪面
   * @member {Number}
   */
  private _near: number;
  /**
   * 相机远裁剪面
   * @member {Number}
   */
  private _far: number;
  /**
   * Define the current limit on the left side for an orthographic camera In scene unit
   * @member {Number}
   */
  private _left: number;
  /**
   * Define the current limit on the right side for an orthographic camera In scene unit
   */
  private _right: number;
  /**
   * Define the current limit on the bottom side for an orthographic camera In scene unit
   */
  private _bottom: number;
  /**
   * Define the current limit on the top side for an orthographic camera In scene unit
   */
  private _top: number;
  /**
   * 标记相机参数更新
   */
  private _dirty: boolean;
  private lastWidth: number;
  private lastHeight: number;
  private _pixelRatio: number;

  constructor(node: o3.Node, props: Props) {
    const cameraProps = {
      RHI: props.RHI || o3.GLRenderHardware,
      SceneRenderer: props.SceneRenderer || o3.BasicSceneRenderer,
      canvas: props.canvas,
      attributes: props.attributes || {}
    };

    super(node, cameraProps);

    if (props.canvas) {
      this.canvas =
        typeof props.canvas === "string" ? (document.getElementById(props.canvas) as HTMLCanvasElement) : props.canvas;
    }

    this._left = props.left || -3;
    this._right = props.right || 3;
    this._bottom = props.bottom || -3;
    this._top = props.top || 3;
    this._near = props.near || 0.01;
    this._far = props.far || 1000;

    this._dirty = false;

    this._pixelRatio = props.pixelRatio || window.devicePixelRatio;

    const clearMode = props.clearMode !== undefined ? props.clearMode : o3.ClearMode.SOLID_COLOR;
    const clearParam = props.clearParam || [0.25, 0.25, 0.25, 1];
    this.setClearMode(clearMode, clearParam);
  }

  public attachToScene(
    canvas: HTMLCanvasElement | string,
    attr: WebGLContextAttributes & { enableCollect?: boolean } = {}
  ) {
    canvas = typeof canvas === "string" ? (document.getElementById(canvas) as HTMLCanvasElement) : canvas;
    super.attachToScene(canvas, attr);
    this.canvas = canvas;
    this.updateSizes();
  }

  /**
   * 像素比率
   * @type {Number}
   */
  get pixelRatio(): number {
    return this._pixelRatio;
  }

  set pixelRatio(v: number) {
    if (v && this._pixelRatio !== v) {
      this._pixelRatio = v;
      this.updateSizes();
    }
  }

  /**
   * 更新画布大小和
   * @param {Number} [pixelRatio=this.pixelRatio] 像素比率
   */
  public updateSizes(pixelRatio = null) {
    if (pixelRatio) {
      this._pixelRatio = pixelRatio;
    }

    const width = (this.canvas.clientWidth * this.pixelRatio) | 0;
    const height = (this.canvas.clientHeight * this.pixelRatio) | 0;

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.canvas.width = width;
      this.canvas.height = height;

      this.setOrtho(this._left, this._right, this._bottom, this._top, this._near, this._far);
      this.setViewport(0, 0, width, height);
      return true;
    }

    return false;
  }

  get near(): number {
    return this._near;
  }

  set near(value: number) {
    this._near = value;
    this.setOrthoFromThis();
  }

  get far(): number {
    return this._far;
  }

  set far(value: number) {
    this._far = value;
    this.setOrthoFromThis();
  }

  get left(): number {
    return this._left;
  }

  set left(value: number) {
    this._left = value;
    this.setOrthoFromThis();
  }

  get right(): number {
    return this._right;
  }

  set right(value: number) {
    this._right = value;
    this.setOrthoFromThis();
  }

  get bottom(): number {
    return this._bottom;
  }

  set bottom(value: number) {
    this._bottom = value;
    this.setOrthoFromThis();
  }

  get top(): number {
    return this._top;
  }

  set top(value: number) {
    this._top = value;
    this.setOrthoFromThis();
  }

  private setOrthoFromThis() {
    this.setOrtho(this._left, this._right, this._bottom, this._top, this._near, this._far);
  }
}
