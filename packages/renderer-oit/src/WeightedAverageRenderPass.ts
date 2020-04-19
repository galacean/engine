import { RenderPass } from "@alipay/o3-renderer-basic";
import { MultiRenderTarget, Texture2D } from "@alipay/o3-material";
import { BlendFunc, TextureFilter, TextureWrapMode, RenderState } from "@alipay/o3-base";

/**
 * Weighted-Average renderPass
 * */
export class WeightedAverageRenderPass extends RenderPass {
  private stateMap = new Map();

  constructor(width: number, height: number) {
    super("Weighted-Average renderPass", -1);

    const renderTarget = new MultiRenderTarget("Weighted-Average MRT", {
      width,
      height
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
      .filter(item => item.primitive)
      .forEach(item => {
        const technique = item.mtl.technique;
        if (technique) {
          this.stateMap.set(technique.cacheID, technique.states);
          technique.states = technique.states || {};
          technique.states = {
            ...technique.states,
            enable: [...(technique.states.enable || []), RenderState.POLYGON_OFFSET_FILL],
            functions: {
              ...technique.states.functions,
              blendFuncSeparate: [BlendFunc.ONE, BlendFunc.ONE, BlendFunc.ONE, BlendFunc.ONE],
              // blendFuncSeparate: [BlendFunc.ONE, BlendFunc.ONE, BlendFunc.ZERO, BlendFunc.ONE_MINUS_SRC_ALPHA],
              polygonOffset: [-1, -4]
            }
          };
        }
      });
  }

  /** 只渲染透明队列 */
  render(camera, opaqueQueue, transparentQueue) {
    transparentQueue.render(camera, null, this.mask);
  }

  /** 还原 GLState */
  postRender(camera, opaqueQueue, transparentQueue) {
    transparentQueue.items
      .filter(item => item.primitive)
      .forEach(item => {
        const technique = item.mtl.technique;
        if (technique) {
          const oriState = this.stateMap.get(technique.cacheID);
          technique.states = oriState;
        }
      });
  }
}
