import { SpriteMask } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
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

  private _preMaskLayer = 0;

  constructor(public engine: Engine) {}

  addSpriteMask(mask: SpriteMask): void {
    this.allSpriteMasks.add(mask);
  }

  buildMaskRenderElement(
    element: SubRenderElement,
    incrementMaskQueue: RenderQueue,
    decrementMaskQueue: RenderQueue
  ): void {
    const renderer = element.component;
    const preMaskLayer = this._preMaskLayer;
    const curMaskLayer = renderer._maskLayer;
    if (preMaskLayer !== curMaskLayer) {
      const masks = this.allSpriteMasks;
      const commonLayer = preMaskLayer & curMaskLayer;
      const addLayer = curMaskLayer & ~preMaskLayer;
      const reduceLayer = preMaskLayer & ~curMaskLayer;

      const allSpriteMasks = masks._elements;
      for (let i = 0, n = masks.length; i < n; i++) {
        const mask = allSpriteMasks[i];
        const influenceLayers = mask.influenceLayers;

        if (influenceLayers & commonLayer) {
          continue;
        }

        if (influenceLayers & addLayer) {
          incrementMaskQueue.pushRenderElement(mask._renderElement);
          continue;
        }

        if (influenceLayers & reduceLayer) {
          decrementMaskQueue.pushRenderElement(mask._renderElement);
        }
      }
    }
    this._preMaskLayer = curMaskLayer;
  }

  clear(): void {
    this.allSpriteMasks.length = 0;
    this._preMaskLayer = 0;
  }

  destroy(): void {
    this.clear();
  }
}
