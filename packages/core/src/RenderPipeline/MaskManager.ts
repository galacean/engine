import { SpriteMask } from "../2d";
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

  addSpriteMask(mask: SpriteMask): void {
    mask._maskIndex = this._allSpriteMasks.length;
    this._allSpriteMasks.add(mask);
  }

  removeSpriteMask(mask: SpriteMask): void {
    const replaced = this._allSpriteMasks.deleteByIndex(mask._maskIndex);
    replaced && (replaced._maskIndex = mask._maskIndex);
    mask._maskIndex = -1;
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
    const data = material.shaderData;
    if (!data.getFloat(MaskManager._stencilEnabledProp)) return false;
    if ((data.getFloat(MaskManager._stencilWriteMaskProp) ?? 0xff) === 0) return false;

    const Keep = StencilOperation.Keep;
    const passFront = data.getFloat(MaskManager._stencilPassOperationFrontProp);
    if (passFront !== undefined && passFront !== Keep) return true;
    const passBack = data.getFloat(MaskManager._stencilPassOperationBackProp);
    if (passBack !== undefined && passBack !== Keep) return true;
    const failFront = data.getFloat(MaskManager._stencilFailOperationFrontProp);
    if (failFront !== undefined && failFront !== Keep) return true;
    const failBack = data.getFloat(MaskManager._stencilFailOperationBackProp);
    if (failBack !== undefined && failBack !== Keep) return true;
    const zFailFront = data.getFloat(MaskManager._stencilZFailOperationFrontProp);
    if (zFailFront !== undefined && zFailFront !== Keep) return true;
    const zFailBack = data.getFloat(MaskManager._stencilZFailOperationBackProp);
    if (zFailBack !== undefined && zFailBack !== Keep) return true;
    return false;
  }

  isReadStencil(material: Material): boolean {
    const data = material.shaderData;
    if (!data.getFloat(MaskManager._stencilEnabledProp)) return false;
    if ((data.getFloat(MaskManager._stencilMaskProp) ?? 0xff) === 0) return false;

    const Always = CompareFunction.Always;
    const Never = CompareFunction.Never;
    const cmpFront = data.getFloat(MaskManager._stencilCompareFunctionFrontProp) ?? Always;
    if (cmpFront !== Always && cmpFront !== Never) return true;
    const cmpBack = data.getFloat(MaskManager._stencilCompareFunctionBackProp) ?? Always;
    if (cmpBack !== Always && cmpBack !== Never) return true;
    return false;
  }

  destroy(): void {
    const allSpriteMasks = this._allSpriteMasks;
    allSpriteMasks.length = 0;
    allSpriteMasks.garbageCollection();
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
