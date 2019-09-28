import * as r3 from "@alipay/o3";
import { Camera } from "./Camera";

interface Props {
  RHI?;
  SceneRenderer?;
  canvas?: string | HTMLCanvasElement;
  attributes?;
  fov?: number;
  near?: number;
  far?: number;
  pixelRatio?: number;
  clearMode?: number;
  clearParam?: number[];
  enableCollect?: boolean;
}

/**
 * 辅助创建默认相机，基于{@link Camera}
 *
 * @alias ADefaultCamera
 * @constructor
 */
export class PerspectiveCamera extends Camera {
  public canvas: HTMLCanvasElement;
  public fov: number;
  public near: number;
  public far: number;
  public lastWidth: number;
  public lastHeight: number;

  private _pixelRatio: number;

  /**
   * 创建一个默认相机
   * @param {Node} node 对象所在节点
   * @param {Object} props  相机配置参数，包含以下项
   * @property {HTMLCanvasElement|String} props.canvas 画布对象，可以是 HTML Canvas Element 或者对象的 id
   * @property {Object} [props.attributes={}] [Canvas 3d ContextAttributes]{@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext}
   * @property {Array} [props.position=[0, 10, 20]] 相机位置
   * @property {Array} [props.target=[0, 0, 0]] 相机看向的目标点
   * @property {Array} [props.up=[0, 1, 0]] 相机上方向
   * @property {Number} [props.fov=45] 透视投影视场角
   * @property {Number} [props.near=1] 透视投影近裁剪面
   * @property {Number} [props.far=1000] 透视投影远裁剪面
   * @property {Number} [props.pixelRatio=window.devicePixelRatio] drawingBufferSize 的缩放比率
   */
  constructor(node: r3.Node, props: Props) {
    const cameraProps = {
      RHI: props.RHI || r3.GLRenderHardware,
      SceneRenderer: props.SceneRenderer || r3.BasicSceneRenderer,
      canvas: props.canvas,
      attributes: props.attributes || {}
    };

    super(node, cameraProps);

    if (props.canvas) {
      this.canvas =
        typeof props.canvas === "string"
          ? (document.getElementById(props.canvas) as HTMLCanvasElement)
          : props.canvas;
    }

    /**
     * 透视相机视场角角度
     * @member {Number}
     */
    this.fov = props.fov || 45;
    /**
     * 透视相机近裁剪面
     * @member {Number}
     */
    this.near = props.near || 0.01;
    /**
     * 透视相机远裁剪面
     * @member {Number}
     */
    this.far = props.far || 1000;
    this._pixelRatio = props.pixelRatio || window.devicePixelRatio;

    const clearMode =
      props.clearMode !== undefined
        ? props.clearMode
        : r3.ClearMode.SOLID_COLOR;
    const clearParam = props.clearParam || [0.25, 0.25, 0.25, 1];
    this.setClearMode(clearMode, clearParam);
  }

  public attachToScene(
    canvas: HTMLCanvasElement | string,
    attr: WebGLContextAttributes & { enableCollect?: boolean } = {}
  ) {
    canvas =
      typeof canvas === "string"
        ? (document.getElementById(canvas) as HTMLCanvasElement)
        : canvas;
    super.attachToScene(canvas, attr);
    this.canvas = canvas;
    this.updateSizes();
  }

  /**
   * 像素比率
   * @type {Number}
   */
  get pixelRatio() {
    return this._pixelRatio;
  }

  set pixelRatio(v) {
    if (v && this._pixelRatio !== v) {
      this._pixelRatio = v;
      this.updateSizes();
    }
  }

  /**
   * 更新画布大小和透视矩阵
   * @param {Number} [pixelRatio=this.pixelRatio] 像素比率
   * @param {Number} [fov=this.fov] 视场角角度
   */
  public updateSizes(pixelRatio = null, fov = null) {
    if (pixelRatio) {
      this._pixelRatio = pixelRatio;
    }
    if (fov) {
      this.fov = fov;
    }

    const width = (this.canvas.clientWidth * this.pixelRatio) | 0;
    const height = (this.canvas.clientHeight * this.pixelRatio) | 0;

    if (width !== this.lastWidth || height !== this.lastHeight) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.canvas.width = width;
      this.canvas.height = height;

      this.setPerspective(this.fov, width, height, this.near, this.far);
      this.setViewport(0, 0, width, height);
      return true;
    }

    return false;
  }
}
