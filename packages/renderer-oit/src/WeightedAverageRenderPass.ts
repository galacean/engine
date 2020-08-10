import { RenderPass, Camera } from "@alipay/o3-core";
import { RenderTarget, RenderColorTexture } from "@alipay/o3-material";
import { BlendFunc, RenderBufferColorFormat } from "@alipay/o3-core";
import { Vector4 } from "@alipay/o3-math";

/**
 * Weighted-Average renderPass
 * */
export class WeightedAverageRenderPass extends RenderPass {
  private stateMap = new Map();

  constructor(width: number, height: number) {
    super("Weighted-Average renderPass", -1);

    const renderTarget = new RenderTarget(width, height, [
      new RenderColorTexture(width, height, RenderBufferColorFormat.R32G32B32A32),
      new RenderColorTexture(width, height, RenderBufferColorFormat.R32G32B32A32)
    ]);

    this.renderTarget = renderTarget;
    this.renderOverride = true;
  }

  get textures(): RenderColorTexture[] {
    return [this.renderTarget.getColorTexture(0), this.renderTarget.getColorTexture(1)];
  }

  preRender(camera: Camera, opaqueQueue, transparentQueue) {
    const defaultRenderPass = camera._renderPipeline.defaultRenderPass;

    // 防止 clearParam 改动
    this.clearParam = new Vector4(0, 0, 0, 0);

    // 保持原 mask
    this.mask = defaultRenderPass.mask;

    // 保存原来的 GLState
    transparentQueue.items
      .filter(({ primitive }) => primitive)
      .forEach(({ mtl }) => {
        this.stateMap.set(mtl, {
          blendFuncSeparate: mtl.blendFuncSeparate
        });
        mtl.blendFuncSeparate = [BlendFunc.ONE, BlendFunc.ONE, BlendFunc.ONE, BlendFunc.ONE];
        // mtl.blendFuncSeparate=[BlendFunc.ONE, BlendFunc.ONE, BlendFunc.ZERO, BlendFunc.ONE_MINUS_SRC_ALPHA];
      });
  }

  /** 只渲染透明队列 */
  render(camera, opaqueQueue, transparentQueue) {
    transparentQueue.render(camera, null, this.mask);
  }

  /** 还原 GLState */
  postRender(camera, opaqueQueue, transparentQueue) {
    transparentQueue.items
      .filter(({ primitive }) => primitive)
      .forEach(({ mtl }) => {
        const { blendFuncSeparate } = this.stateMap.get(mtl);
        mtl.blendFuncSeparate = blendFuncSeparate;
      });
  }
}
