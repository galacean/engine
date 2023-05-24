import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { SpriteRenderer } from "../2d/sprite/SpriteRenderer";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { SpriteMaskBatcher } from "./SpriteMaskBatcher";
import { SpriteMaskRenderData } from "./SpriteMaskRenderData";

/**
 * @internal
 */
export class SpriteMaskManager {
  _batcher: SpriteMaskBatcher;

  private _preMaskLayer: number = 0;

  constructor(engine: Engine) {
    this._batcher = new SpriteMaskBatcher(engine);
  }

  clear(): void {
    this._preMaskLayer = 0;
    this._batcher.clear();
  }

  preRender(camera: Camera, renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    this._batcher.clear();
    this._processMasksDiff(camera, renderer);
    this._batcher.flush(camera);
  }

  postRender(renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    this._preMaskLayer = renderer.maskLayer;
  }

  destroy(): void {
    this._batcher.destroy();
    this._batcher = null;
  }

  private _processMasksDiff(camera: Camera, renderer: SpriteRenderer): void {
    const preMaskLayer = this._preMaskLayer;
    const curMaskLayer = renderer.maskLayer;
    if (preMaskLayer !== curMaskLayer) {
      const allMasks = camera._renderPipeline._allSpriteMasks;
      const commonLayer = preMaskLayer & curMaskLayer;
      const addLayer = curMaskLayer & ~preMaskLayer;
      const reduceLayer = preMaskLayer & ~curMaskLayer;

      const allMaskElements = allMasks._elements;
      for (let i = 0, n = allMasks.length; i < n; i++) {
        const mask = allMaskElements[i];
        const influenceLayers = mask.influenceLayers;

        if (influenceLayers & commonLayer) {
          continue;
        }

        if (influenceLayers & addLayer) {
          const maskRenderElement = mask._maskElement;
          (<SpriteMaskRenderData>maskRenderElement.data).isAdd = true;
          this._batcher.drawElement(maskRenderElement, camera);
          continue;
        }

        if (influenceLayers & reduceLayer) {
          const maskRenderElement = mask._maskElement;
          (<SpriteMaskRenderData>maskRenderElement.data).isAdd = false;
          this._batcher.drawElement(maskRenderElement, camera);
        }
      }
    }
  }
}
