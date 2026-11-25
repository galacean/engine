import { Vector4 } from "@galacean/engine-math";
import { BasicResources, RenderStateElementMap } from "../BasicResources";
import { Logger } from "../base/Logger";
import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { RenderElement } from "./RenderElement";
import { IMaskRenderable } from "../2d/sprite/MaskRenderable";
import { SpriteMask } from "../2d/sprite/SpriteMask";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { SpriteMaskLayer } from "../enums/SpriteMaskLayer";
import { Material } from "../material";
import { CompareFunction, Shader, ShaderProperty, ShaderData, ShaderDataGroup } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { StencilOperation } from "../shader/enums/StencilOperation";
import { DisorderedArray } from "../utils/DisorderedArray";
import { RenderContext } from "./RenderContext";
import { RenderQueue } from "./RenderQueue";
import { PipelineStage } from "./enums/PipelineStage";
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
  private static _maskRectProp = ShaderProperty.getByName("renderElement_MaskRect");
  private static _maskAxisXProp = ShaderProperty.getByName("renderElement_MaskAxisX");
  private static _maskAxisYProp = ShaderProperty.getByName("renderElement_MaskAxisY");
  private static _defaultMaskAxisX = new Vector4(1, 0, 0, 0);
  private static _defaultMaskAxisY = new Vector4(0, 1, 0, 0);

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
  private _uiRectBits = 0;
  private _rectMaskQueue = new RenderQueue(RenderQueueType.Transparent);
  private _rectMaskElement = new RenderElement();
  private _rectMaskData = new ShaderData(ShaderDataGroup.RenderElement);

  constructor() {
    this._rectMaskData.setVector4(MaskManager._maskRectProp, new Vector4());
    this._rectMaskData.setVector4(MaskManager._maskAxisXProp, MaskManager._defaultMaskAxisX);
    this._rectMaskData.setVector4(MaskManager._maskAxisYProp, MaskManager._defaultMaskAxisY);
  }

  addSpriteMask(mask: SpriteMask): void {
    mask._maskIndex = this._allSpriteMasks.length;
    this._allSpriteMasks.add(mask);
  }

  removeSpriteMask(mask: SpriteMask): void {
    const replaced = this._allSpriteMasks.deleteByIndex(mask._maskIndex);
    replaced && (replaced._maskIndex = mask._maskIndex);
    mask._maskIndex = -1;
  }

  /**
   * Allocate one bit per image Mask or nonempty Outside rectangle. A set bit means the
   * ancestor allows the pixel. Inside rectangles remain a separate shader discard fast path.
   * UI owns these bits; arbitrary custom stencil materials must not share them during UI draws.
   */
  drawUIMasks(context: RenderContext, stage: string, receiver: RenderElement): readonly RenderStateElementMap[] | null {
    const { component } = receiver;
    const interaction = component._maskInteraction;
    const clip = receiver._uiClip!;
    const masks = interaction === SpriteMaskInteraction.None ? null : clip.masks;
    const spriteCount = masks?.length ?? 0;
    const rects = clip.outsideRects;
    const rectCount = rects?.length ?? 0;
    if (spriteCount + rectCount > 8) {
      Logger.warn("UI masks support at most 8 stencil ancestors.");
      return null;
    }
    if (!context.hasStencil) {
      Logger.warn(
        "UI stencil masks require a render target with a stencil attachment (for example TextureFormat.DepthStencil)."
      );
      return null;
    }
    if (this._preMaskLayer !== SpriteMaskLayer.Nothing) this.clearMask(context, stage);

    const previous = this._uiMasks;
    let common = 0;
    while (common < previous.length && common < spriteCount && previous[common] === masks![common]) common++;
    const oldSuffix = ((1 << previous.length) - 1) & ~((1 << common) - 1);
    const newSuffix = ((1 << spriteCount) - 1) & ~((1 << common) - 1);
    const rectBits = ((1 << rectCount) - 1) << spriteCount;
    // Keep the common image prefix. In one draw, release old bits, clear new image bits,
    // and initialize Outside bits to one. Rectangles depend on the receiver's plane.
    this._writeUIBits(context, oldSuffix | newSuffix | this._uiRectBits | rectBits, rectBits);
    this._uiRectBits = rectBits;
    previous.length = common;
    // Shape writers use their Forward pass on the currently bound target, including the depth prepass.
    const queue = this._rectMaskQueue;
    const batcher = context.camera.engine._batcherManager;
    for (let i = common; i < spriteCount; i++) {
      const mask = masks![i];
      const bit = 1 << i;
      // Invalid shapes leave their bit zero: Inside fails, the complement succeeds.
      if (mask._renderMask(0)) {
        queue.pushRenderElement(mask._renderElement);
        queue.batch(batcher);
        batcher.primitiveChunkManagerMask.uploadBuffer();
        queue.render(
          context,
          PipelineStage.Forward,
          RenderQueueMaskType.Increment,
          BasicResources.getUIMaskWriteStates(bit, bit)
        );
        queue.clear();
      }
      previous.push(mask);
    }

    if (rectCount) {
      const material = context.camera.engine._basicResources.uiRectMaskMaterial;
      const element = this._rectMaskElement;
      element.set(
        component,
        material,
        receiver.primitive,
        receiver.subPrimitive,
        undefined,
        undefined,
        this._rectMaskData
      );
      element.subShader = material.shader.subShaders[0];
      this._rectMaskData.setVector4(MaskManager._maskAxisXProp, clip.axisX);
      this._rectMaskData.setVector4(MaskManager._maskAxisYProp, clip.axisY);
      queue.batchedElements.push(element);
      for (let i = 0; i < rectCount; i++) {
        this._rectMaskData.setVector4(MaskManager._maskRectProp, rects![i]);
        queue.render(
          context,
          PipelineStage.Forward,
          RenderQueueMaskType.Increment,
          BasicResources.getUIMaskWriteStates(1 << (spriteCount + i), 0)
        );
      }
      queue.clear();
      // This reusable draw element must not retain a receiver or its resources.
      element.set(null!, null!, null!, null!);
      element.subShader = null!;
    }
    return BasicResources.getUIMaskReadStates(spriteCount, rectCount, interaction);
  }

  clearUIMasks(context: RenderContext): void {
    this._writeUIBits(context, ((1 << this._uiMasks.length) - 1) | this._uiRectBits, 0);
    this._uiMasks.length = 0;
    this._uiRectBits = 0;
  }

  /** Initialize or release only allocated bits, without gl.clear or touching color/depth. */
  private _writeUIBits(context: RenderContext, bits: number, reference: number): void {
    if (!bits) return;
    const { camera } = context;
    const { engine } = camera;
    const resources = engine._basicResources;
    const material = resources.uiRectMaskMaterial;
    const pass = material.shader.subShaders[0].passes[1];
    const macros = Shader._compileMacros;
    ShaderMacroCollection.unionCollection(camera._globalShaderMacro, material.shaderData._macroCollection, macros);
    ShaderMacroCollection.unionCollection(macros, engine._macroCollection, macros);
    const program = pass._getShaderProgram(engine, macros);
    if (!program.isValid) return;
    program.bind();
    pass._renderState._applyStates(
      engine,
      false,
      pass._renderStateDataMap,
      material.shaderData,
      BasicResources.getUIMaskWriteStates(bits, reference),
      this._rectMaskData
    );
    engine._hardwareRenderer.drawPrimitive(resources.blitMesh._primitive, resources.blitMesh.subMesh, program);
  }

  drawMask(context: RenderContext, pipelineStageTagValue: string, maskLayer: SpriteMaskLayer): void {
    this.clearUIMasks(context);
    const incrementMaskQueue = MaskManager.getMaskIncrementRenderQueue();
    const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();

    this._buildMaskRenderElement(maskLayer, incrementMaskQueue, decrementMaskQueue);

    const batcherManager = context.camera.engine._batcherManager;
    incrementMaskQueue.batch(batcherManager);
    batcherManager.primitiveChunkManagerMask.uploadBuffer();
    incrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Increment);
    incrementMaskQueue.clear();
    decrementMaskQueue.batch(batcherManager);
    batcherManager.primitiveChunkManagerMask.uploadBuffer();
    decrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Decrement);
    decrementMaskQueue.clear();
  }

  clearMask(context: RenderContext, pipelineStageTagValue: string): void {
    this.clearUIMasks(context);
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
        batcherManager.primitiveChunkManagerMask.uploadBuffer();
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
    this._rectMaskQueue.clear();
    this._rectMaskElement.dispose();
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
