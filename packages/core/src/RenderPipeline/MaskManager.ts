import { SpriteMask } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { RenderQueueType } from "../shader";
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
    element: SubRenderElement,
    incrementMaskQueue: RenderQueue,
    decrementMaskQueue: RenderQueue
  ): void {
    const preMaskLayer = this.preMaskLayer;
    const curMaskLayer = element.component._maskLayer;
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
          mask.getMaterial().renderState.renderQueueType = incrementMaskQueue.renderQueueType;
          incrementMaskQueue.pushRenderElement(mask._renderElement);
        } else if (influenceLayers & reduceLayer) {
          mask.getMaterial().renderState.renderQueueType = decrementMaskQueue.renderQueueType;
          decrementMaskQueue.pushRenderElement(mask._renderElement);
        }
      }
      this.preMaskLayer = curMaskLayer;
    }
  }

  destroy(): void {
    this.allSpriteMasks.length = 0;
  }
}
