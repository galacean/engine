import { SpriteMask, SpriteMaskInteraction, SpriteRenderer, TextRenderer } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { StencilOperation } from "../shader";
import { RenderQueue } from "./RenderQueue";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class MaskManager {
  allSpriteMasks = new DisorderedArray<SpriteMask>();

  private _preMaskLayer = 0;

  constructor(public engine: Engine) {}

  addSpriteMask(mask: SpriteMask): void {
    this.allSpriteMasks.add(mask);
  }

  buildMaskRenderElement(element: SubRenderElement, renderQueue: RenderQueue): void {
    const renderer = element.component;
    // @ts-ignore
    const maskInteraction = renderer.maskInteraction;
    if (maskInteraction && maskInteraction !== SpriteMaskInteraction.None) {
      this._processMasksDiff(<SpriteRenderer | TextRenderer>renderer, renderQueue);
    }
  }

  clear(): void {
    this.allSpriteMasks.length = 0;
    this._preMaskLayer = 0;
  }

  destroy(): void {
    this.clear();
  }

  private _processMasksDiff(renderer: SpriteRenderer | TextRenderer, renderQueue: RenderQueue): void {
    const preMaskLayer = this._preMaskLayer;
    const curMaskLayer = renderer.maskLayer;
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
          mask._renderElement.data.subRenderElements[0].stencilOperation = StencilOperation.IncrementSaturate;
          renderQueue.pushRenderElement(mask._renderElement);
          continue;
        }

        if (influenceLayers & reduceLayer) {
          mask._renderElement.data.subRenderElements[0].stencilOperation = StencilOperation.DecrementSaturate;
          renderQueue.pushRenderElement(mask._renderElement);
        }
      }
    }
    this._preMaskLayer = curMaskLayer;
  }
}
