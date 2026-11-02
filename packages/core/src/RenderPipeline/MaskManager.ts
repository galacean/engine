import { IMaskRenderable } from "../2d/sprite/MaskRenderable";
import { SpriteMask } from "../2d/sprite/SpriteMask";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Material } from "../material";
import { CompareFunction, ShaderProperty } from "../shader";
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
  private static _stencilEnabledProp = ShaderProperty.getByName("stencilEnabled");
  private static _stencilWriteMaskProp = ShaderProperty.getByName("stencilWriteMask");
  private static _stencilMaskProp = ShaderProperty.getByName("stencilMask");
  private static _stencilCompareFunctionFrontProp = ShaderProperty.getByName("stencilCompareFunctionFront");
  private static _stencilCompareFunctionBackProp = ShaderProperty.getByName("stencilCompareFunctionBack");
  private static _stencilPassOperationFrontProp = ShaderProperty.getByName("stencilPassOperationFront");
  private static _stencilPassOperationBackProp = ShaderProperty.getByName("stencilPassOperationBack");
  private static _stencilFailOperationFrontProp = ShaderProperty.getByName("stencilFailOperationFront");
  private static _stencilFailOperationBackProp = ShaderProperty.getByName("stencilFailOperationBack");
  private static _stencilZFailOperationFrontProp = ShaderProperty.getByName("stencilZFailOperationFront");
  private static _stencilZFailOperationBackProp = ShaderProperty.getByName("stencilZFailOperationBack");

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
  private _allSpriteMasks = new DisorderedArray<SpriteMask>();
  private _uiMasks: IMaskRenderable[] = [];

  addSpriteMask(mask: SpriteMask): void {
    mask._maskIndex = this._allSpriteMasks.length;
    this._allSpriteMasks.add(mask);
  }

  removeSpriteMask(mask: SpriteMask): void {
    const replaced = this._allSpriteMasks.deleteByIndex(mask._maskIndex);
    replaced && (replaced._maskIndex = mask._maskIndex);
    mask._maskIndex = -1;
  }

  /** Update only the changed suffix of the ancestor chain. Each shape contributes one stencil count. */
  drawUIMasks(context: RenderContext, stage: string, masks: readonly IMaskRenderable[]): void {
    if (this._preMaskLayer !== SpriteMaskLayer.Nothing) {
      this.clearMask(context, stage);
    }
    const previous = this._uiMasks;
    let common = 0;
    while (common < previous.length && common < masks.length && previous[common] === masks[common]) {
      common++;
    }
    this._drawUIMaskRange(context, stage, previous, common, RenderQueueMaskType.Decrement);
    previous.length = common;
    this._drawUIMaskRange(context, stage, masks, common, RenderQueueMaskType.Increment);
    for (let i = common; i < masks.length; i++) {
      previous.push(masks[i]);
    }
  }

  clearUIMasks(context: RenderContext, stage: string): void {
    this._drawUIMaskRange(context, stage, this._uiMasks, 0, RenderQueueMaskType.Decrement);
    this._uiMasks.length = 0;
  }

  private _drawUIMaskRange(
    context: RenderContext,
    stage: string,
    masks: readonly IMaskRenderable[],
    start: number,
    type: RenderQueueMaskType
  ): void {
    if (start === masks.length) return;
    const queue =
      type === RenderQueueMaskType.Increment
        ? MaskManager.getMaskIncrementRenderQueue()
        : MaskManager.getMaskDecrementRenderQueue();
    for (let i = start; i < masks.length; i++) {
      const mask = masks[i];
      // Prepare even offscreen masks: an invalid/empty ancestor must still constrain its children.
      if (mask._renderMask(0)) {
        queue.pushRenderElement(mask._renderElement);
      }
    }
    const batcher = context.camera.engine._batcherManager;
    queue.batch(batcher);
    batcher.uploadBuffer();
    queue.render(context, stage, type);
    queue.clear();
  }

  drawMask(context: RenderContext, pipelineStageTagValue: string, maskLayer: SpriteMaskLayer): void {
    this.clearUIMasks(context, pipelineStageTagValue);
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
    this.clearUIMasks(context, pipelineStageTagValue);
    const preMaskLayer = this._preMaskLayer;
    if (preMaskLayer !== SpriteMaskLayer.Nothing) {
      if (this.hasStencilWritten) {
        const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();
        const masks = this._allSpriteMasks;
        for (let i = 0, n = masks.length; i < n; i++) {
          const mask = masks.get(i);
          if (mask.influenceLayers & preMaskLayer && mask._renderMask(mask._distanceForSort)) {
            decrementMaskQueue.pushRenderElement(mask._renderElement);
          }
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
    const data = material.shaderData;
    if (!data.getFloat(MaskManager._stencilEnabledProp)) return false;
    if ((data.getFloat(MaskManager._stencilWriteMaskProp) ?? 0xff) === 0) return false;

    const keep = StencilOperation.Keep;
    const passFront = data.getFloat(MaskManager._stencilPassOperationFrontProp);
    if (passFront !== undefined && passFront !== keep) return true;
    const passBack = data.getFloat(MaskManager._stencilPassOperationBackProp);
    if (passBack !== undefined && passBack !== keep) return true;
    const failFront = data.getFloat(MaskManager._stencilFailOperationFrontProp);
    if (failFront !== undefined && failFront !== keep) return true;
    const failBack = data.getFloat(MaskManager._stencilFailOperationBackProp);
    if (failBack !== undefined && failBack !== keep) return true;
    const zFailFront = data.getFloat(MaskManager._stencilZFailOperationFrontProp);
    if (zFailFront !== undefined && zFailFront !== keep) return true;
    const zFailBack = data.getFloat(MaskManager._stencilZFailOperationBackProp);
    if (zFailBack !== undefined && zFailBack !== keep) return true;
    return false;
  }

  isReadStencil(material: Material): boolean {
    const data = material.shaderData;
    if (!data.getFloat(MaskManager._stencilEnabledProp)) return false;
    if ((data.getFloat(MaskManager._stencilMaskProp) ?? 0xff) === 0) return false;

    const always = CompareFunction.Always;
    const never = CompareFunction.Never;
    const cmpFront = data.getFloat(MaskManager._stencilCompareFunctionFrontProp);
    if (cmpFront !== undefined && cmpFront !== always && cmpFront !== never) return true;
    const cmpBack = data.getFloat(MaskManager._stencilCompareFunctionBackProp);
    if (cmpBack !== undefined && cmpBack !== always && cmpBack !== never) return true;
    return false;
  }

  destroy(): void {
    const allSpriteMasks = this._allSpriteMasks;
    allSpriteMasks.length = 0;
    allSpriteMasks.garbageCollection();
    this._uiMasks.length = 0;
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

        if (influenceLayers & curMaskLayer && mask._renderMask(mask._distanceForSort)) {
          incrementMaskQueue.pushRenderElement(mask._renderElement);
        } else if (influenceLayers & reduceLayer && mask._renderMask(mask._distanceForSort)) {
          decrementMaskQueue.pushRenderElement(mask._renderElement);
        }
      }
      this._preMaskLayer = curMaskLayer;
    }
  }
}
