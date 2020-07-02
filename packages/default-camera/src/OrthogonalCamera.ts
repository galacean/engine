import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { Node } from "@alipay/o3-core";
import { BasicSceneRenderer } from "@alipay/o3-renderer-basic";
import { OldCamera } from "./OldCamera";
import { ClearMode } from "@alipay/o3-base";

interface Props {
  RHI?: GLRenderHardware;
  SceneRenderer?: BasicSceneRenderer;
  canvas?: string | HTMLCanvasElement;
  attributes?;
  near?: number;
  far?: number;
  size?: number;
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
export class OrthographicCamera extends OldCamera {
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
   * 正交摄像头大小，比例是计算出来的
   */
  private _size: number;

  /**
   * 标记相机参数更新
   */
  private lastWidth: number;
  private lastHeight: number;
  private _pixelRatio: number;

  constructor(node: Node, props: Props) {
    const cameraProps = {
      RHI: props.RHI || GLRenderHardware,
      SceneRenderer: props.SceneRenderer || BasicSceneRenderer,
      canvas: props.canvas,
      attributes: props.attributes || {}
    };

    super(node, cameraProps);

    if (props.canvas) {
      this.canvas =
        typeof props.canvas === "string" ? (document.getElementById(props.canvas) as HTMLCanvasElement) : props.canvas;
    }

    this._size = props.size || 10;
    this._near = props.near || 0;
    this._far = props.far || 1000;

    this._pixelRatio = props.pixelRatio || window.devicePixelRatio;

    const clearMode = props.clearMode !== undefined ? props.clearMode : ClearMode.SOLID_COLOR;
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

      this.setOrthoFromThis();
      this.setViewport(0, 0, width, height);
      return true;
    }

    return false;
  }

  /**
   * 正交摄像头上下大小
   */
  set size(v: number) {
    this._size = v;
    this.setOrthoFromThis();
  }

  /**
   * 正交摄像头上下大小
   */
  get size(): number {
    return this._size;
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

  private setOrthoFromThis() {
    const width = (this._size * this.lastWidth) / this.lastHeight;
    const height = this._size;
    this.setOrtho(-width, width, -height, height, this._near, this._far);
  }
}
