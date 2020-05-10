import { RenderPass } from "@alipay/o3-renderer-basic";
import { MultiRenderTarget, Texture2D } from "@alipay/o3-material";
import { BlendFunc, TextureFilter, TextureWrapMode } from "@alipay/o3-base";

/**
 * Weighted-Average renderPass
 * */
export class WeightedAverageRenderPass extends RenderPass {
  private stateMap = new Map();

  constructor(width: number, height: number) {
    super("Weighted-Average renderPass", -1);

    const renderTarget = new MultiRenderTarget("Weighted-Average MRT", {
      width,
      height,
      colorBufferFloat: true
    });
    const config = {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR,
      wrapS: TextureWrapMode.CLAMP_TO_EDGE,
      wrapT: TextureWrapMode.CLAMP_TO_EDGE
    };
    renderTarget.addTexColor(new Texture2D("mrt_0", null, config));
    renderTarget.addTexColor(new Texture2D("mrt_1", null, config));

    this.renderTarget = renderTarget;
    this.renderOverride = true;
  }

  get textures(): Texture2D[] {
    return (this.renderTarget as MultiRenderTarget).textures;
  }

  preRender(camera, opaqueQueue, transparentQueue) {
    const defaultRenderPass = camera.sceneRenderer.defaultRenderPass;

    // 防止 clearParam 改动
    this.clearParam = this.renderTarget.clearColor = [0, 0, 0, 0];

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
