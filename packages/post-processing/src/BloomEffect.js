import { Vector2, Vector4 } from "@alipay/o3-math";
import { CompositeNode } from "./nodes/CompositeNode";
import { GaussianBlurNode } from "./nodes/GaussianBlurNode";
import { HighPassNode } from "./nodes/HighPassNode";
import { PostEffectNode } from "./PostEffectNode";

/**
 * Bloom 后处理效果
 * 参考：https://docs.unrealengine.com/en-us/Engine/Rendering/PostProcessEffects/Bloom
 */
export class BloomEffect extends PostEffectNode {
  /**
   * 构造函数
   * @param {PostProcessFeature} manager 插件对象
   * @param {object} props 配置项
   */
  constructor(manager, props) {
    super("Bloom", null, null, null);

    const rtPool = manager.renderTargets;
    const BLUR_COUNT = 5;

    let brightRT = {};
    let rtSize = 1024;
    let blurSize = Math.floor(rtSize / 2);
    if (props && props.rtSize) {
      const rtColor = new Vector4(0.0, 0.0, 0.0, 1.0);
      rtSize = props.rtSize;
      blurSize = Math.floor(rtSize / 2);

      const blurVRT = rtPool.require("scene_blurVRT", {
        width: blurSize,
        height: blurSize,
        clearColor: rtColor
      });
    } else {
      brightRT = rtPool.require("scene_" + rtSize);
    }

    // 第一步：使用一个PASS提取高亮度的像素点
    const brightPass = new HighPassNode("BrightPass", brightRT, this);

    // 第二步：对高亮部分进行 Down Sample 同时执行高斯模糊
    const blurRT = [];

    const filterSizeArray = [3, 5, 7, 9, 11];
    let blurHParent = brightPass;

    for (let i = 0; i < BLUR_COUNT; i++) {
      const blurSize = Math.floor(rtSize / 2);
      const blurHRT = rtPool.require("scene_" + blurSize);
      const passH = new GaussianBlurNode("DownSampleH_" + blurSize, blurHRT, blurHParent, filterSizeArray[i]);
      passH.direction = new Vector2(0.5, 0.0);

      const blurVRT = rtPool.require("backup_" + blurSize);
      const passV = new GaussianBlurNode("DownSampleV_" + blurSize, blurVRT, passH, filterSizeArray[i]);
      passV.direction = new Vector2(0.0, 0.5);
      blurRT.push(blurVRT);

      blurHParent = passH;
      rtSize = rtSize / 2;
    }

    // 第三步：将模糊之后的结果，按照指定的强度叠加到初始画面上
    const compositeRT = brightRT;
    const compositePass = new CompositeNode("BloomComposite", compositeRT, this, BLUR_COUNT);
    compositePass.setCompositeRenderTargets(blurRT);

    //--
    this._brightPass = brightPass;
    this._compositePass = compositePass;
  }

  /**
   * 高亮的阀值
   */
  get brightThreshold() {
    return this._brightPass.threshold;
  }
  set brightThreshold(value) {
    this._brightPass.threshold = value;
  }

  /**
   * 平滑插值的采样宽度
   */
  get smoothWidth() {
    return this._brightPass.smoothWidth;
  }
  set smoothWidth(value) {
    this._brightPass.smoothWidth = value;
  }

  /**
   * 亮度增强的强度
   */
  get strength() {
    return this._compositePass.strength;
  }
  set strength(value) {
    this._compositePass.strength = value;
  }
}
