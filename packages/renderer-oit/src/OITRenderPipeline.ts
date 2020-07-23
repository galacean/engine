import { GLCapabilityType, Logger, OITMode } from "@alipay/o3-base";
import { BasicRenderPipeline, Camera } from "@alipay/o3-core";
import { OpaqueRenderPass } from "./OpaqueRenderPass";
import { ScreenRenderPass } from "./ScreenRenderPass";
import { WeightedAverageRenderPass } from "./WeightedAverageRenderPass";

/**
 * OIT(Order Independent Transparency,次序无关透明度渲染)
 * 开启后，场景中的 PBR 透明材质将自动使用 OIT.
 * // todo: 目前 OIT 依赖于 MRT ，待定: 非 MRT 时是否需要支持开启 OIT
 * */
export class OITRenderPipeline extends BasicRenderPipeline {
  /** 是否支持 OIT  */
  public canOIT = true;

  /** OIT 模式，默认加权平均算法 */
  private _mode: OITMode;

  private width: number;
  private height: number;

  private opaqueRenderPass: OpaqueRenderPass;
  private weightedAverageRenderPass: WeightedAverageRenderPass;
  private screenRenderPass: ScreenRenderPass;

  public get mode(): OITMode {
    return this._mode;
  }

  public set mode(v: OITMode) {
    if (v !== this.mode) {
      this._mode = v;
      switch (this.mode) {
        case OITMode.WEIGHTED_AVERAGE:
          this.initWeightedAverage();
          break;
        case OITMode.DEPTH_PEEL:
          break;
        case OITMode.DUAL_DEPTH_PEEL:
          break;
      }
    }
  }

  public get depthTexture() {
    return this.opaqueRenderPass.renderTarget.depthTexture;
  }

  constructor(camera: Camera) {
    super(camera);
    const canMRT = camera.engine.hardwareRenderer.canIUse(GLCapabilityType.drawBuffers);
    if (!canMRT) {
      Logger.warn("检测到当前环境不支持 MRT, 性能考虑不建议开启 OIT。已为您自动降级为 BasicRenderPipeline");
      this.canOIT = false;
      return;
    }

    // 放到 JS 任务队列最后，获取真实分辨率
    setTimeout(() => {
      const { drawingBufferWidth, drawingBufferHeight } = camera.engine.hardwareRenderer.gl;

      this.width = drawingBufferWidth;
      this.height = drawingBufferHeight;

      /** 默认 WEIGHTED_AVERAGE */
      this.mode = OITMode.WEIGHTED_AVERAGE;
    }, 0);
  }

  resize(width?: number, height?: number) {
    let changed = false;
    if (width && width !== this.width) {
      this.width = width;
      changed = true;
    }
    if (height && height !== this.height) {
      this.height = height;
      changed = true;
    }
    if (changed) {
      switch (this.mode) {
        case OITMode.WEIGHTED_AVERAGE:
          this.initWeightedAverage();
          break;
        case OITMode.DEPTH_PEEL:
          break;
        case OITMode.DUAL_DEPTH_PEEL:
          break;
      }
    }
  }

  private clearWeightedAverage() {
    this.removeRenderPass(this.opaqueRenderPass);
    this.removeRenderPass(this.weightedAverageRenderPass);
    this.removeRenderPass(this.screenRenderPass);
    this.removeRenderPass(this.defaultRenderPass);
    this.opaqueRenderPass = null;
    this.weightedAverageRenderPass = null;
    this.screenRenderPass = null;
  }

  private initWeightedAverage() {
    this.clearWeightedAverage();

    this.opaqueRenderPass = new OpaqueRenderPass(this.width, this.height);
    this.weightedAverageRenderPass = new WeightedAverageRenderPass(this.width, this.height);
    this.screenRenderPass = new ScreenRenderPass(this.weightedAverageRenderPass.textures);

    this.addRenderPass(this.opaqueRenderPass);
    this.addRenderPass(this.weightedAverageRenderPass);
    this.addRenderPass(this.screenRenderPass);
  }
}
