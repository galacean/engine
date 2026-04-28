import { Vector3 } from "@galacean/engine-math";
import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { IMaskRenderable } from "../2d/sprite/MaskRenderable";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Material } from "../material";
import { CompareFunction } from "../shader";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { StencilOperation } from "../shader/enums/StencilOperation";
import { DisorderedArray } from "../utils/DisorderedArray";
import { RenderContext } from "./RenderContext";
import { RenderQueue } from "./RenderQueue";
import { RenderQueueMaskType } from "./enums/RenderQueueMaskType";

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

  hasStencilWritten = false;

  private _preMaskLayer = SpriteMaskLayer.Nothing;
  private _allSpriteMasks = new DisorderedArray<IMaskRenderable>();
  private _filteredMasksByLayer = new Map<SpriteMaskLayer, IMaskRenderable[]>();
  private _isFilteredMasksDirty = true;

  addSpriteMask(mask: IMaskRenderable): void {
    mask._maskIndex = this._allSpriteMasks.length;
    this._allSpriteMasks.add(mask);
    this._setFilteredMasksDirty();
  }

  removeSpriteMask(mask: IMaskRenderable): void {
    const replaced = this._allSpriteMasks.deleteByIndex(mask._maskIndex);
    replaced && (replaced._maskIndex = mask._maskIndex);
    mask._maskIndex = -1;
    this._setFilteredMasksDirty();
  }

  onMaskInfluenceLayersChange(): void {
    this._setFilteredMasksDirty();
  }

  isVisibleByMask(maskInteraction: SpriteMaskInteraction, maskLayer: SpriteMaskLayer, worldPoint: Vector3): boolean {
    if (maskInteraction === SpriteMaskInteraction.None) {
      return true;
    }

    const masks = this._getMasksByLayer(maskLayer);
    let insideMask = false;
    for (let i = 0, n = masks.length; i < n; i++) {
      if (masks[i]._containsWorldPoint(worldPoint)) {
        insideMask = true;
        break;
      }
    }

    switch (maskInteraction) {
      case SpriteMaskInteraction.VisibleInsideMask:
        return insideMask;
      case SpriteMaskInteraction.VisibleOutsideMask:
        return !insideMask;
      default:
        return true;
    }
  }

  drawMask(context: RenderContext, pipelineStageTagValue: string, maskLayer: SpriteMaskLayer): void {
    const incrementMaskQueue = MaskManager.getMaskIncrementRenderQueue();
    const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();

    this._buildMaskRenderElement(maskLayer, incrementMaskQueue, decrementMaskQueue);

    const batcherManager = context.camera.engine._batcherManager;
    incrementMaskQueue.batch(batcherManager);
    batcherManager.uploadBuffer();
    incrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Increment);
    incrementMaskQueue.clear();
    decrementMaskQueue.batch(batcherManager);
    batcherManager.uploadBuffer();
    decrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Decrement);
    decrementMaskQueue.clear();
  }

  clearMask(context: RenderContext, pipelineStageTagValue: string): void {
    const preMaskLayer = this._preMaskLayer;
    if (preMaskLayer !== SpriteMaskLayer.Nothing) {
      if (this.hasStencilWritten) {
        const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();
        const masks = this._allSpriteMasks;
        for (let i = 0, n = masks.length; i < n; i++) {
          const mask = masks.get(i);
          mask.influenceLayers & preMaskLayer && decrementMaskQueue.pushRenderElement(mask._renderElement);
        }

        const batcherManager = context.camera.engine._batcherManager;
        decrementMaskQueue.batch(batcherManager);
        batcherManager.uploadBuffer();
        decrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Decrement);
        decrementMaskQueue.clear();
      } else {
        const engine = context.camera.engine;
        engine._hardwareRenderer.clearRenderTarget(engine, CameraClearFlags.Stencil, null);
      }

      this._preMaskLayer = SpriteMaskLayer.Nothing;
    }
  }

  isStencilWritten(material: Material): boolean {
    const stencilState = material.renderState.stencilState;
    const stencilOperation = StencilOperation.Keep;
    if (
      stencilState.enabled &&
      stencilState.writeMask !== 0x00 &&
      (stencilState.passOperationFront !== stencilOperation ||
        stencilState.passOperationBack !== stencilOperation ||
        stencilState.failOperationFront !== stencilOperation ||
        stencilState.failOperationBack !== stencilOperation ||
        stencilState.zFailOperationFront !== stencilOperation ||
        stencilState.zFailOperationBack !== stencilOperation)
    ) {
      return true;
    }
    return false;
  }

  isReadStencil(material: Material): boolean {
    const { enabled, mask, compareFunctionFront, compareFunctionBack } = material.renderState.stencilState;
    if (
      enabled &&
      mask !== 0x00 &&
      ((compareFunctionFront !== CompareFunction.Always && compareFunctionFront !== CompareFunction.Never) ||
        (compareFunctionBack !== CompareFunction.Always && compareFunctionBack !== CompareFunction.Never))
    ) {
      return true;
    }
    return false;
  }

  destroy(): void {
    const allSpriteMasks = this._allSpriteMasks;
    allSpriteMasks.length = 0;
    allSpriteMasks.garbageCollection();
    this._filteredMasksByLayer.clear();
    this._isFilteredMasksDirty = true;
  }

  private _setFilteredMasksDirty(): void {
    this._isFilteredMasksDirty = true;
  }

  private _getMasksByLayer(maskLayer: SpriteMaskLayer): IMaskRenderable[] {
    if (maskLayer === SpriteMaskLayer.Nothing) {
      return [];
    }

    if (this._isFilteredMasksDirty) {
      this._filteredMasksByLayer.clear();
      this._isFilteredMasksDirty = false;
    }

    let filteredMasks = this._filteredMasksByLayer.get(maskLayer);
    if (!filteredMasks) {
      filteredMasks = [];
      const allMasks = this._allSpriteMasks;
      const maskElements = allMasks._elements;
      for (let i = 0, n = allMasks.length; i < n; i++) {
        const mask = maskElements[i];
        if (mask.influenceLayers & maskLayer) {
          filteredMasks.push(mask);
        }
      }
      this._filteredMasksByLayer.set(maskLayer, filteredMasks);
    }
    return filteredMasks;
  }

  private _buildMaskRenderElement(
    curMaskLayer: SpriteMaskLayer,
    incrementMaskQueue: RenderQueue,
    decrementMaskQueue: RenderQueue
  ): void {
    const preMaskLayer = this._preMaskLayer;
    if (preMaskLayer !== curMaskLayer) {
      const masks = this._allSpriteMasks;
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
      this._preMaskLayer = curMaskLayer;
    }
  }
}
