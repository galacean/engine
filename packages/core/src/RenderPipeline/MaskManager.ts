import { SpriteMask, SpriteMaskInteraction, SpriteRenderer, TextRenderer } from "../2d";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { StencilOperation } from "../shader";
import { RenderElement } from "./RenderElement";
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

  insertMask(elements: Array<RenderElement>, maskInsertedElements: Array<RenderElement>): void {
    const length = elements.length;
    if (length === 0) {
      return;
    }

    const renderElementPool = this.engine._renderElementPool;
    for (let i = 0; i < length; ++i) {
      const renderElement = elements[i];
      const maskInsertedRenderElement = renderElementPool.get();
      maskInsertedElements[i] = maskInsertedRenderElement;
      maskInsertedRenderElement.set(renderElement.data);
      const subRenderElements = renderElement.subRenderElements;
      for (let j = 0, n = subRenderElements.length; j < n; ++j) {
        const subRenderElement = subRenderElements[j];
        const renderer = subRenderElement.subData.component;
        // @ts-ignore
        const maskInteraction = renderer.maskInteraction;
        if (maskInteraction && maskInteraction !== SpriteMaskInteraction.None) {
          this._processMasksDiff(<SpriteRenderer | TextRenderer>renderer, maskInsertedRenderElement);
        }
        maskInsertedRenderElement.addSubRenderElement(subRenderElement);
      }
    }
  }

  clear(): void {
    this.allSpriteMasks.length = 0;
    this._preMaskLayer = 0;
  }

  destroy(): void {
    this.clear();
  }

  private _processMasksDiff(renderer: SpriteRenderer | TextRenderer, maskInsertedElement: RenderElement): void {
    const subRenderElementPool = this.engine._subRenderElementPool;
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
          const subRenderElement = subRenderElementPool.get();
          this._cloneRenderElement(mask._renderElement.subRenderElements[0], subRenderElement);
          subRenderElement.stencilOperation = StencilOperation.IncrementSaturate;
          maskInsertedElement.addSubRenderElement(subRenderElement);
          continue;
        }

        if (influenceLayers & reduceLayer) {
          const subRenderElement = subRenderElementPool.get();
          this._cloneRenderElement(mask._renderElement.subRenderElements[0], subRenderElement);
          subRenderElement.stencilOperation = StencilOperation.DecrementSaturate;
          maskInsertedElement.addSubRenderElement(subRenderElement);
        }
      }
    }
    this._preMaskLayer = curMaskLayer;
  }

  private _cloneRenderElement(srcElement: SubRenderElement, dstElement: SubRenderElement): void {
    dstElement.set(srcElement.data, srcElement.subData, srcElement.shaderPasses);
  }
}
