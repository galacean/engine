import { SpriteMask } from "../2d";
import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { SpriteRenderer } from "../2d/sprite/SpriteRenderer";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { StencilOperation } from "../shader";
import { SpriteMaskBatcher } from "./batcher/SpriteMaskBatcher";

/**
 * @internal
 */
export class SpriteMaskManager {
  /** @internal */
  _batcher: SpriteMaskBatcher;
  /** @internal */
  _allSpriteMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

  private _preMaskLayer: number = 0;

  constructor(engine: Engine) {
    this._batcher = new SpriteMaskBatcher(engine, 128);
  }

  addMask(mask: SpriteMask): void {
    this._allSpriteMasks.add(mask);
  }

  clear(): void {
    this._allSpriteMasks.length = 0;
    this._preMaskLayer = 0;
    this._batcher.clear();
  }

  preRender(camera: Camera, renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    this._batcher.clear();
    this._processMasksDiff(camera, renderer);
    this._batcher.uploadAndDraw(camera);
  }

  postRender(renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    this._preMaskLayer = renderer.maskLayer;
  }

  destroy(): void {
    this._allSpriteMasks.length = 0;
    this._batcher.destroy();
    this._batcher = null;
  }

  private _processMasksDiff(camera: Camera, renderer: SpriteRenderer): void {
    const preMaskLayer = this._preMaskLayer;
    const curMaskLayer = renderer.maskLayer;
    if (preMaskLayer !== curMaskLayer) {
      const { _allSpriteMasks: masks } = this;
      const commonLayer = preMaskLayer & curMaskLayer;
      const addLayer = curMaskLayer & ~preMaskLayer;
      const reduceLayer = preMaskLayer & ~curMaskLayer;

      const allMaskElements = masks._elements;
      for (let i = 0, n = masks.length; i < n; i++) {
        const mask = allMaskElements[i];
        const influenceLayers = mask.influenceLayers;

        if (influenceLayers & commonLayer) {
          continue;
        }

        if (influenceLayers & addLayer) {
          const maskRenderElement = mask._maskElement;
          this._batcher.drawElement(maskRenderElement, camera, StencilOperation.IncrementSaturate);
          continue;
        }

        if (influenceLayers & reduceLayer) {
          const maskRenderElement = mask._maskElement;
          this._batcher.drawElement(maskRenderElement, camera, StencilOperation.DecrementSaturate);
        }
      }
    }
  }
}
