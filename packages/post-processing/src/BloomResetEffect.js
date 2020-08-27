import { RenderTarget } from '@alipay/o3';
import { Vector3 } from '@alipay/o3';
import { PostEffectNode } from './PostEffectNode';
import { ExtractHighlightPassNode } from './nodes/ExtractHighlightPassNode';
import { KernelBlurPassNode } from './nodes/KernelBlurPassNode';
import { BloomMergePassNode } from './nodes/BloomMergePassNode';



/**
 * Bloom Reset 版后处理效果
 * 参考 https://github.com/BabylonJS/Babylon.js/blob/master/src/PostProcess/babylon.bloomEffect.ts
 */
export class BloomResetEffect extends PostEffectNode {
  /**
   * Bloom Reset 版
   * @param {PostProcessFeature} manager 后处理管理器
   * @param {Object} props 可选参数包含以下可选项
   * @param {Number} [props.rtSize=1024] Rende Target 大小
   * @param {Number} [props.exposure=0.8] 提取高光时画面曝光度
   * @param {Number} [props.threshold=0.7] 提取高光时的阈值
   * @param {Number} [props.kernel=89] 模糊算子的核数
   * @param {Number} [props.weight=0.8] Bloom 的强度
   * @param {Number} [props.horizontalBlur=1] 水平方向拉伸
   * @param {Number} [props.verticalBlur=1] 垂直方向拉伸
   * @param {Vector3} [props.tintColor=new Vector3(1,1,1)] Bloom 颜色修正
   */
  constructor(manager, props = {}) {
    super("Bloom", null, null, null);

    const rtSize = 1;
    const brightRT = new RenderTarget(rtSize, rtSize, new RenderColorTexture(rtSize, rtSize));
    const hRT = new RenderTarget(rtSize, rtSize, new RenderColorTexture(rtSize, rtSize));
    const vRT = new RenderTarget(rtSize, rtSize, new RenderColorTexture(rtSize, rtSize));

    const brightPass = new ExtractHighlightPassNode("BrightPass", brightRT, this);

    const horizontalBlurPass = new KernelBlurPassNode("kernelBlur", hRT, brightPass);
    horizontalBlurPass.direction = [1, 0];

    const verticalBlurPass = new KernelBlurPassNode("kernelBlur", vRT, horizontalBlurPass);
    verticalBlurPass.direction = [0, 1];

    const mergePass = new BloomMergePassNode("merge", hRT, this);
    mergePass.setBlurRenderTarget(verticalBlurPass.renderTarget);

    this.brightPass = brightPass;
    this.horizontalBlurPass = horizontalBlurPass;
    this.verticalBlurPass = verticalBlurPass;
    this.mergePass = mergePass;

    this.exposure = props.exposure || 0.8;
    this.threshold = props.threshold || 0.7;
    this.kernel = props.kernel || 89;
    this.weight = props.weight || 0.8;
    this.horizontalBlur = props.horizontalBlur || 1;
    this.verticalBlur = props.verticalBlur || 1;
    this.tintColor = props.tintColor || new Vector3(1, 1, 1);
  }

  draw(feature, camera) {
    const parentRT = this.getSourceRenderTarget();
    const sourceWidth = parentRT && parentRT.width;
    const sourceHeight = parentRT && parentRT.height;

    if (this.brightPass.renderTarget.width !== sourceWidth || this.brightPass.renderTarget.height !== sourceHeight) {
      const brightRT = new RenderTarget(sourceWidth, sourceHeight, new RenderColorTexture(sourceWidth, sourceHeight));
      const hRT = new RenderTarget(sourceWidth, sourceHeight, new RenderColorTexture(sourceWidth, sourceHeight));
      const vRT = new RenderTarget(sourceWidth, sourceHeight, new RenderColorTexture(sourceWidth, sourceHeight));

      this.brightPass.renderTarget = brightRT;
      this.horizontalBlurPass.renderTarget = hRT;
      this.verticalBlurPass.renderTarget = vRT;
      this.mergePass.renderTarget = hRT;
      this.mergePass.setBlurRenderTarget(this.verticalBlurPass.renderTarget);
    }

    return super.draw(feature, camera);
  }

  /**
   * @type {Number}
   * 提取高光时画面曝光度
   */
  get exposure() {
    return this.brightPass.exposure;
  }

  set exposure(v) {
    this.brightPass.exposure = v;
  }

  /**
   * @type {Number}
   * 提取高光时的阈值
   */
  get threshold() {
    return this.brightPass.threshold;
  }

  set threshold(v) {
    this.brightPass.threshold = v;
  }

  /**
   * @type {Number}
   * 模糊算子的核数
   */
  get kernel() {
    return this.horizontalBlurPass.kernel;
  }

  set kernel(v) {
    this.horizontalBlurPass.kernel = v;
    this.verticalBlurPass.kernel = v;
  }

  /**
   * @type {Number}
   * Bloom 的强度
   */
  get weight() {
    return this.mergePass.weight;
  }

  set weight(v) {
    this.mergePass.weight = v;
  }

  /**
   * @type {Number}
   * 水平方向拉伸
   */
  get horizontalBlur() {
    return this.horizontalBlurPass.direction[0];
  }

  set horizontalBlur(v) {
    this.horizontalBlurPass.direction = [v, 0];
  }

  /**
   * @type {Number}
   * 垂直方向拉伸
   */
  get verticalBlur() {
    return this.verticalBlurPass.direction[1];
  }

  set verticalBlur(v) {
    this.verticalBlurPass.direction = [0, v];
  }

  /**
   * @type {Array}
   * Bloom 颜色修正
   */
  get tintColor() {
    return this.mergePass.tintColor;
  }

  set tintColor(v) {
    this.mergePass.tintColor = v;
  }
}
