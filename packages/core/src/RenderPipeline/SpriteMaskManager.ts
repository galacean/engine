import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { SpriteMask } from "../2d/sprite/SpriteMask";
import { SpriteRenderer } from "../2d/sprite/SpriteRenderer";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { SpriteMaskBatcher } from "./SpriteMaskBatcher";

export class SpriteMaskManager {
  private static _tempMasks: Set<SpriteMask> = new Set<SpriteMask>();

  private _batcher: SpriteMaskBatcher = null;
  private _curCamera: Camera = null;
  private _allMasks: DisorderedArray<SpriteMask> = new DisorderedArray();
  private _previousMasks: DisorderedArray<SpriteMask> = new DisorderedArray();
  private _curMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

  constructor(engine: Engine) {
    this._batcher = new SpriteMaskBatcher(engine);
  }

  addMask(mask: SpriteMask): void {
    this._allMasks.add(mask);
  }

  removeMask(mask: SpriteMask): void {
    this._allMasks.delete(mask);
  }

  preRender(renderer: SpriteRenderer, camera: Camera): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    this._curCamera = camera;
    this._batcher.clear();
    this._findMasks(renderer, this._curMasks);
    this._processMasksDiff();

    this._batcher.flush(camera.engine);
  }

  postRender(renderer: SpriteRenderer): void {
    if (renderer.maskInteraction === SpriteMaskInteraction.None) {
      return;
    }

    // Swap masks
    const temp = this._previousMasks;
    this._previousMasks = this._curMasks;
    this._curMasks = temp;
    this._curMasks.length = 0;
  }

  clear(): void {
    this._previousMasks.length = 0;
    this._curMasks.length = 0;
    this._batcher.clear();
  }

  destroy(): void {
    this._batcher.destroy();
    this._batcher = null;
  }

  /**
   * Find all masks that the renderer used.
   */
  private _findMasks(renderer: SpriteRenderer, masks: DisorderedArray<SpriteMask>): void {
    const { _curCamera: camera, _allMasks: allMasks } = this;
    const maskLayer = renderer.maskLayer;
    const elements = allMasks._elements;
    for (let i = 0, l = allMasks.length; i < l; ++i) {
      const element = elements[i];
      if (camera.cullingMask & element.entity.layer && maskLayer & element.influenceLayers) {
        masks.add(element);
      }
    }
  }

  /**
   * Process the differences between all current masks and all previous masks.
   */
  private _processMasksDiff(): void {
    const curMasks = this._previousMasks;
    const newMasks = this._curMasks;
    const curElements = curMasks._elements;
    const newElements = newMasks._elements;
    const curLen = curMasks.length;
    const newLen = newMasks.length;

    if (newLen === 0) {
      return;
    }

    if (curLen === 0) {
      for (let i = 0; i < newLen; ++i) {
        this._preDrawMask(newElements[i], true);
      }
      return;
    }

    const repeatMasks = SpriteMaskManager._tempMasks;
    repeatMasks.clear();
    for (let i = 0; i < curLen; ++i) {
      const curElement = curElements[i];
      for (let j = 0; j < newLen; ++j) {
        if (curElement === newElements[j]) {
          repeatMasks.add(curElement);
        }
      }
    }

    for (let i = 0; i < newLen; ++i) {
      const element = newElements[i];
      if (!repeatMasks.has(element)) {
        this._preDrawMask(element, true);
      }
    }

    for (let i = 0; i < curLen; ++i) {
      const element = curElements[i];
      if (!repeatMasks.has(element)) {
        this._preDrawMask(element, false);
      }
    }
  }

  private _preDrawMask(mask: SpriteMask, isAdd: boolean): void {
    const element = mask._getElement();
    if (element) {
      element.isAdd = isAdd;
      element.camera = this._curCamera;
      this._batcher.drawElement(element);
    }
  }
}
