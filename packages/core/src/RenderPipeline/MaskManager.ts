import { SpriteMask } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { RenderQueueType, StencilOperation } from "../shader";
import { RenderQueue } from "./RenderQueue";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class MaskManager {
  private static _maskIncrementRenderQueue: RenderQueue;
  private static _maskDecrementRenderQueue: RenderQueue;

  static getMaskIncrementRenderQueue(): RenderQueue {
    return (MaskManager._maskIncrementRenderQueue ||= new RenderQueue(RenderQueueType.Transparent));
  }

  static getMaskDecrementRenderQueue(): RenderQueue {
    return (MaskManager._maskDecrementRenderQueue ||= new RenderQueue(RenderQueueType.Transparent));
  }

  allSpriteMasks = new DisorderedArray<SpriteMask>();
  preMaskLayer = 0;

  addSpriteMask(mask: SpriteMask): void {
    mask._maskIndex = this.allSpriteMasks.length;
    this.allSpriteMasks.add(mask);
  }

  removeSpriteMask(mask: SpriteMask): void {
    const replaced = this.allSpriteMasks.deleteByIndex(mask._maskIndex);
    replaced && (replaced._maskIndex = mask._maskIndex);
    mask._maskIndex = -1;
  }

  buildMaskRenderElement(
    elementOrNumber: SubRenderElement | number,
    incrementMaskQueue: RenderQueue,
    decrementMaskQueue: RenderQueue
  ): void {
    const preMaskLayer = this.preMaskLayer;
    const curMaskLayer = typeof elementOrNumber === "number" ? elementOrNumber : elementOrNumber.component._maskLayer;
    if (preMaskLayer !== curMaskLayer) {
      const masks = this.allSpriteMasks;
      const commonLayer = preMaskLayer & curMaskLayer;
      const reduceLayer = preMaskLayer & ~curMaskLayer;
      const maskElements = masks._elements;
      for (let i = 0, n = masks.length; i < n; i++) {
        const mask = maskElements[i];
        const influenceLayers = mask.influenceLayers;

        if (influenceLayers & commonLayer) {
          continue;
        }

        if (influenceLayers & curMaskLayer) {
          incrementMaskQueue.pushRenderElement(mask._renderElement);
        } else if (influenceLayers & reduceLayer) {
          decrementMaskQueue.pushRenderElement(mask._renderElement);
        }
      }
      this.preMaskLayer = curMaskLayer;
    }
  }

  clear(engine: Engine, renderQueueType: RenderQueueType, pipelineStageTagValue: string): void {
    const incrementMaskQueue = MaskManager.getMaskIncrementRenderQueue();
    incrementMaskQueue.renderQueueType = renderQueueType;
    incrementMaskQueue.clear();
    const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();
    decrementMaskQueue.renderQueueType = renderQueueType;
    decrementMaskQueue.clear();

    this.buildMaskRenderElement(0, incrementMaskQueue, decrementMaskQueue);

    const { _renderContext: context, _batcherManager: batcherManager } = engine;
    incrementMaskQueue.batch(engine._batcherManager);
    batcherManager.uploadBuffer();
    incrementMaskQueue.render(context, pipelineStageTagValue, StencilOperation.IncrementSaturate);
    decrementMaskQueue.batch(engine._batcherManager);
    batcherManager.uploadBuffer();
    decrementMaskQueue.render(context, pipelineStageTagValue, StencilOperation.DecrementSaturate);
  }

  destroy(): void {
    this.allSpriteMasks.length = 0;
  }
}
