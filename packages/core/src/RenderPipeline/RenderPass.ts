import { ClearMode, MaskList } from "../base";
import { Camera } from "../Camera";
import { Vector4 } from "@alipay/o3-math";

/** @todo: monorepo circle dependence */
type RenderTarget = any;
type Material = any;

let passNum = 0;

/**
 * RednerPass 对象
 */
class RenderPass {
  public name: string;
  public enabled: boolean;
  public priority: number;
  public renderTarget: RenderTarget;
  public replaceMaterial;
  public mask: MaskList;
  public renderOverride: boolean;
  public clearMode;
  private _clearParam;

  /**
   * RenderPass 构造函数
   * @param name 这个 Pass 的名称
   * @param priority 优先级，小于0在默认Pass之前，大于0在默认Pass之后
   * @param renderTarget 指定的 Render Target
   * @param replaceMaterial 替换模型的默认材质
   * @param mask 与 Component.renderPassFlag 进行 bit and 操作，对这个 Pass 需要渲染的对象进行筛选
   * @param clearParam 清除renderTarget的背景颜色
   */
  constructor(
    name = `RENDER_PASS${passNum++}`,
    priority = 0,
    renderTarget = null,
    replaceMaterial = null,
    mask = null,
    clearParam = new Vector4(0, 0, 0, 0)
  ) {
    this.name = name;
    this.enabled = true;
    this.priority = priority;
    this.renderTarget = renderTarget;
    this.replaceMaterial = replaceMaterial;
    this.mask = mask || MaskList.EVERYTHING;
    this.renderOverride = false; ///< 若 renderOverride 设为了 true，则需要实现 render(camera) 方法

    /**
     * 画布清除模式，默认为 ClearMode.SOLID_COLOR
     * @member {number}
     */
    this.clearMode = ClearMode.SOLID_COLOR;
    this._clearParam = clearParam; // PASS use render target's clearParam
  }

  /**
   * 画布清除参数，默认使用 RenderTarget 的 clearColor
   * @type {*}
   */
  get clearParam() {
    return this._clearParam;
  }

  set clearParam(v) {
    this._clearParam = v;
  }

  /**
   * 用于自定义的渲染过程，若 renderOverride 设为了 true 将被执行到
   * @param {Camera} camera 相机
   * @param {RenderQueue} opaqueQueue 不透明物体渲染队列
   * @param {RenderQueue} transparentQueue 透明物体渲染队列
   */
  render(camera: Camera, opaqueQueue, transparentQueue) {}

  /**
   * Pass 渲染前调用
   * @param {Camera} camera 相机
   * @param {RenderQueue} opaqueQueue 不透明物体渲染队列
   * @param {RenderQueue} transparentQueue 透明物体渲染队列
   */
  preRender(camera: Camera, opaqueQueue, transparentQueue) {}

  /**
   * Pass 渲染后调用
   * @param {Camera} camera 相机
   * @param {RenderQueue} opaqueQueue 不透明物体渲染队列
   * @param {RenderQueue} transparentQueue 透明物体渲染队列
   */
  postRender(camera: Camera, opaqueQueue, transparentQueue) {}
}

export { RenderPass };
