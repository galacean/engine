import { Vector4 } from "@alipay/o3";
import { CompositeNode } from "./nodes/CompositeNode";
import { SSAOBlurNode } from "./nodes/SSAOBlurNode";
import { SSAOPassNode } from "./nodes/SSAOPassNode";
import { PostEffectNode } from "./PostEffectNode";

/**
 * SSAO 效果
 */
export class SSAOEffect extends PostEffectNode {
  constructor(manager, props) {
    super("SSAO", null, null, null);

    const rtPool = manager.renderTargets;

    let AORT = {};
    let blurHRT = {};
    let blurVRT = {};
    let compositeRT = {};
    if (props && props.rtSize) {
      const rtColor = new Vector4(0.0, 0.0, 0.0, 1.0);

      AORT = rtPool.require("scene_AORT", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });

      blurHRT = rtPool.require("scene_blurHRT", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });

      blurVRT = rtPool.require("scene_blurVRT", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });

      compositeRT = rtPool.require("scene_compositeRT", {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      });
    } else {
      const rtSize = 1024;
      AORT = rtPool.require("scene_" + rtSize);
      blurHRT = rtPool.require("scene_" + rtSize);
      blurVRT = rtPool.require("scene_" + rtSize);
      compositeRT = rtPool.require("scene_" + rtSize);
    }

    //ao pass
    const AOPass = new SSAOPassNode("ssaopassnode", AORT, this, props);

    //ao bilateral blur
    const composeRT = [];
    const blurPassH = new SSAOBlurNode("ssaoBlurH", blurHRT, AOPass);
    blurPassH.direction = -1.0;

    const filterSize = 7;
    const blurPassV = new SSAOBlurNode("ssaoBlurV", blurVRT, blurPassH, filterSize);
    blurPassV.direction = 1.0;

    composeRT.push(blurVRT);

    //composite
    const compositePass = new CompositeNode("composite", compositeRT, this, 1, true);
    compositePass.setCompositeRenderTargets(composeRT);

    this._ao = AOPass;
    this._blurH = blurPassH;
    this._blurV = blurPassV;
    this._compos = compositePass;
  }

  /**
   * 场景深度 贴图
   */
  get depthTexture() {
    return this._ao.depthTexture;
  }

  set depthTexture(value) {
    this._ao.depthTexture = value;
    this._blurH.depthTexture = value;
    this._blurV.depthTexture = value;
  }

  /**
   * 法线纹理 贴图
   */
  get normalTexture() {
    return this._ao.normalTexture;
  }

  set normalTexture(value) {
    this._ao.normalTexture = value;
    this._blurH.normalTexture = value;
    this._blurV.normalTexture = value;
  }

  /**
   * 采样半径
   */
  get radius() {
    return this._ao.radius;
  }

  set radius(value) {
    this._ao.radius = value;
  }

  /**
   * 模糊尺寸
   */
  get blurSize() {
    return this._blurH.blurSize;
  }

  set blurSize(value) {
    this._blurH.blurSize = value;
    this._blurV.blurSize = value;
  }

  /**
   * 渲染模式
   */
  get chooser() {
    return this._compos.chooser;
  }

  set chooser(value) {
    this._compos.chooser = value;
  }

  /**
   * 法线偏差
   */
  get bias() {
    return this._ao.bias;
  }

  set bias(value) {
    this._ao.bias = value;
  }

  /**
   * 深度偏差
   */
  get depthBias() {
    return this._blurH.depthBias;
  }

  set depthBias(value) {
    this._blurH.depthBias = value;
    this._blurV.depthBias = value;
  }

  /**
   * 相机逆投影矩阵
   */
  get projectionInvertMat() {
    return this._ao.projectionInvertMat;
  }

  set projectionInvertMat(value) {
    this._ao.projectionInvertMat = value;
  }

  /**
   * 相机投影矩阵
   */
  get projectionMat() {
    return this._ao._projectionMat;
  }

  set projectionMat(value) {
    this._ao._rojectionMat = value;
  }

  /**
   * ao黑白强度粗调
   */
  get attenuation_x() {
    return this._ao.attenuation_x;
  }

  set attenuation_x(value) {
    this._ao.attenuation_x = value;
  }

  /**
   * ao黑白强度细调
   */
  get attenuation_y() {
    return this._ao.attenuation_y;
  }

  set attenuation_y(value) {
    this._ao.attenuation_y = value;
  }
}
