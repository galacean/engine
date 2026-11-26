import { RenderQueueType } from "../shader";
import { BatcherManager } from "./BatcherManager";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { RenderQueue } from "./RenderQueue";
import { ForwardOpaqueOrder } from "./enums/ForwardOpaqueOrder";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * @internal
 * Culling results.
 */
export class CullingResults {
  readonly opaqueQueue: RenderQueue;
  readonly transparentQueue: RenderQueue;
  readonly alphaTestQueue: RenderQueue;

  hasForwardCoverage = false;
  private readonly _forwardOpaque: RenderElement[] = [];
  private readonly _forwardBackground: RenderElement[] = [];
  private readonly _forwardAlphaTest: RenderElement[] = [];

  constructor() {
    this.opaqueQueue = new RenderQueue(RenderQueueType.Opaque);
    this.transparentQueue = new RenderQueue(RenderQueueType.Transparent);
    this.alphaTestQueue = new RenderQueue(RenderQueueType.AlphaTest);
  }

  reset(): void {
    this.opaqueQueue.clear();
    this.transparentQueue.clear();
    this.alphaTestQueue.clear();
    this.hasForwardCoverage = false;
    this._forwardOpaque.length = this._forwardBackground.length = this._forwardAlphaTest.length = 0;
  }

  sortBatch(batcherManager: BatcherManager) {
    this.opaqueQueue.sortBatch(RenderQueue.compareForOpaque, batcherManager);
    this.alphaTestQueue.sortBatch(RenderQueue.compareForOpaque, batcherManager);
    this.transparentQueue.sortBatch(RenderQueue.compareForTransparent, batcherManager);
  }

  renderForward(context: RenderContext, reorder = true): void {
    const { opaqueQueue, alphaTestQueue } = this;
    if (reorder && this.hasForwardCoverage) {
      const opaque = this._forwardOpaque;
      const background = this._forwardBackground;
      for (const element of opaqueQueue.batchedElements) {
        if (element.component._forwardOpaqueOrder === ForwardOpaqueOrder.Background) {
          background.push(element);
        } else {
          opaque.push(element);
        }
      }

      if (background.length > 0) {
        const alphaTest = this._forwardAlphaTest;
        const coverageStart = opaque.length;
        for (const element of alphaTestQueue.batchedElements) {
          if (element.component._forwardOpaqueOrder === ForwardOpaqueOrder.Coverage) {
            opaque.push(element);
          } else {
            alphaTest.push(element);
          }
        }
        const coverageEnd = opaque.length;
        for (const element of background) opaque.push(element);

        // Keep the same opaque submission and depth buffer so coverage can reject background shading.
        // DepthOnly and ShadowCaster still consume the original batches and pass queue types.
        opaqueQueue.renderForward(context, opaque, coverageStart, coverageEnd);
        alphaTestQueue.renderForward(context, alphaTest);
        opaque.length = background.length = alphaTest.length = 0;
        return;
      }
      opaque.length = 0;
    }

    opaqueQueue.render(context, PipelineStage.Forward);
    alphaTestQueue.render(context, PipelineStage.Forward);
  }

  setRenderUpdateFlagTrue(rendererUpdateFlag: ContextRendererUpdateFlag): void {
    this.opaqueQueue.rendererUpdateFlag |= rendererUpdateFlag;
    this.transparentQueue.rendererUpdateFlag |= rendererUpdateFlag;
    this.alphaTestQueue.rendererUpdateFlag |= rendererUpdateFlag;
  }

  destroy(): void {
    this.opaqueQueue.destroy();
    this.transparentQueue.destroy();
    this.alphaTestQueue.destroy();
  }
}
