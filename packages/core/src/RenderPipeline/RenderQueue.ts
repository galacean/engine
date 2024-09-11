import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { Utils } from "../Utils";
import { CompareFunction, RenderQueueType, Shader, StencilOperation, StencilState } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderStateElementKey } from "../shader/enums/RenderStateElementKey";
import { BatcherManager } from "./BatcherManager";
import { MaskManager } from "./MaskManager";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class RenderQueue {
  private static _customStates: Record<number, any> = {};

  static compareForOpaque(a: RenderElement, b: RenderElement): number {
    return a.priority - b.priority || a.distanceForSort - b.distanceForSort;
  }

  static compareForTransparent(a: RenderElement, b: RenderElement): number {
    return a.priority - b.priority || b.distanceForSort - a.distanceForSort;
  }

  readonly elements = new Array<RenderElement>();
  readonly batchedSubElements = new Array<SubRenderElement>();

  constructor(public renderQueueType: RenderQueueType) {}

  pushRenderElement(element: RenderElement): void {
    this.elements.push(element);
  }

  sortBatch(compareFunc: Function, batcherManager: BatcherManager): void {
    this._sort(compareFunc);
    this._batch(batcherManager);
  }

  render(
    context: RenderContext,
    pipelineStageTagValue: string,
    stencilOperation: StencilOperation = StencilOperation.Keep
  ): void {
    const batchedSubElements = this.batchedSubElements;
    const length = batchedSubElements.length;
    if (length === 0) {
      return;
    }

    const { rendererUpdateFlag, camera } = context;
    const { engine, scene, instanceId: cameraId, shaderData: cameraData } = camera;
    const { instanceId: sceneId, shaderData: sceneData } = scene;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const pipelineStageKey = RenderContext.pipelineStageKey;

    for (let i = 0; i < length; i++) {
      const subElement = batchedSubElements[i];
      const { component: renderer, batched } = subElement;

      // @todo: Can optimize update view projection matrix updated
      if (
        rendererUpdateFlag & ContextRendererUpdateFlag.WorldViewMatrix ||
        renderer._batchedTransformShaderData != batched
      ) {
        // Update world matrix and view matrix and model matrix
        renderer._updateTransformShaderData(context, false, batched);
        renderer._batchedTransformShaderData = batched;
      } else if (rendererUpdateFlag & ContextRendererUpdateFlag.ProjectionMatrix) {
        // Only projection matrix need updated
        renderer._updateTransformShaderData(context, true, batched);
      }

      const maskInteraction = renderer._maskInteraction;
      const customStates = RenderQueue._customStates;
      const maskInteractionNotNone = maskInteraction !== SpriteMaskInteraction.None;
      if (maskInteractionNotNone) {
        this._drawMask(context, pipelineStageTagValue, subElement);

        customStates[RenderStateElementKey.StencilStateEnabled] = true;
        customStates[RenderStateElementKey.StencilStateWriteMask] = 0x00;
        customStates[RenderStateElementKey.StencilStateReferenceValue] = 1;
        const compareFunc =
          maskInteraction === SpriteMaskInteraction.VisibleInsideMask
            ? CompareFunction.LessEqual
            : CompareFunction.Greater;
        customStates[RenderStateElementKey.StencilStateCompareFunctionFront] = compareFunc;
        customStates[RenderStateElementKey.StencilStateCompareFunctionBack] = compareFunc;
      }

      const compileMacros = Shader._compileMacros;
      const { primitive, material, shaderPasses, shaderData: renderElementShaderData } = subElement;
      const { shaderData: rendererData, instanceId: rendererId } = renderer;
      const { shaderData: materialData, instanceId: materialId, renderStates } = material;

      // Union render global macro and material self macro
      ShaderMacroCollection.unionCollection(renderer._globalShaderMacro, materialData._macroCollection, compileMacros);

      if (stencilOperation !== StencilOperation.Keep) {
        const { stencilState } = material.renderState;
        stencilState.passOperationFront = stencilOperation;
        stencilState.passOperationBack = stencilOperation;
      }

      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass.getTagValue(pipelineStageKey) !== pipelineStageTagValue) {
          continue;
        }

        const program = shaderPass._getShaderProgram(engine, compileMacros);
        if (!program.isValid) {
          continue;
        }

        const switchProgram = program.bind();
        const switchRenderCount = renderCount !== program._uploadRenderCount;

        if (switchRenderCount) {
          program.groupingOtherUniformBlock();
          program.uploadAll(program.sceneUniformBlock, sceneData);
          program.uploadAll(program.cameraUniformBlock, cameraData);
          program.uploadAll(program.rendererUniformBlock, rendererData);
          program.uploadAll(program.materialUniformBlock, materialData);
          renderElementShaderData && program.uploadAll(program.renderElementUniformBlock, renderElementShaderData);
          // UnGroup textures should upload default value, texture uint maybe change by logic of texture bind.
          program.uploadUnGroupTextures();
          program._uploadSceneId = sceneId;
          program._uploadCameraId = cameraId;
          program._uploadRendererId = rendererId;
          program._uploadMaterialId = materialId;
          program._uploadRenderCount = renderCount;
        } else {
          if (program._uploadSceneId !== sceneId) {
            program.uploadAll(program.sceneUniformBlock, sceneData);
            program._uploadSceneId = sceneId;
          } else if (switchProgram) {
            program.uploadTextures(program.sceneUniformBlock, sceneData);
          }

          if (program._uploadCameraId !== cameraId) {
            program.uploadAll(program.cameraUniformBlock, cameraData);
            program._uploadCameraId = cameraId;
          } else if (switchProgram) {
            program.uploadTextures(program.cameraUniformBlock, cameraData);
          }

          if (program._uploadRendererId !== rendererId) {
            program.uploadAll(program.rendererUniformBlock, rendererData);
            program._uploadRendererId = rendererId;
          } else if (switchProgram) {
            program.uploadTextures(program.rendererUniformBlock, rendererData);
          }

          if (program._uploadMaterialId !== materialId) {
            program.uploadAll(program.materialUniformBlock, materialData);
            program._uploadMaterialId = materialId;
          } else if (switchProgram) {
            program.uploadTextures(program.materialUniformBlock, materialData);
          }

          renderElementShaderData && program.uploadAll(program.renderElementUniformBlock, renderElementShaderData);

          // We only consider switchProgram case, because UnGroup texture's value is always default.
          if (switchProgram) {
            program.uploadUnGroupTextures();
          }
        }

        const renderState = shaderPass._renderState ?? renderStates[j];
        renderState._applyStates(
          engine,
          renderer.entity.transform._isFrontFaceInvert(),
          shaderPass._renderStateDataMap,
          material.shaderData,
          maskInteractionNotNone ? customStates : null
        );
        rhi.drawPrimitive(primitive, subElement.subPrimitive, program);
      }
    }
  }

  clear(): void {
    this.elements.length = 0;
    this.batchedSubElements.length = 0;
  }

  destroy(): void {}

  private _sort(compareFunc: Function): void {
    Utils._quickSort(this.elements, 0, this.elements.length, compareFunc);
  }

  private _batch(batcherManager: BatcherManager): void {
    batcherManager.batch(this);
  }

  private _drawMask(context: RenderContext, pipelineStageTagValue: string, master: SubRenderElement): void {
    const incrementMaskQueue = MaskManager.getMaskIncrementRenderQueue();
    incrementMaskQueue.renderQueueType = this.renderQueueType;
    incrementMaskQueue.clear();

    const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();
    decrementMaskQueue.renderQueueType = this.renderQueueType;
    decrementMaskQueue.clear();

    const camera = context.camera;
    const engine = camera.engine;
    camera.scene._maskManager.buildMaskRenderElement(master, incrementMaskQueue, decrementMaskQueue);

    incrementMaskQueue._batch(engine._batcherManager);
    incrementMaskQueue.render(context, pipelineStageTagValue, StencilOperation.IncrementSaturate);
    decrementMaskQueue._batch(engine._batcherManager);
    decrementMaskQueue.render(context, pipelineStageTagValue, StencilOperation.DecrementSaturate);
  }

  private _copyStencilState(scrStencilState: StencilState, dstStencilState: StencilState): void {
    dstStencilState.enabled = scrStencilState.enabled;
    dstStencilState.writeMask = scrStencilState.writeMask;
    dstStencilState.referenceValue = scrStencilState.referenceValue;
    dstStencilState.compareFunctionFront = scrStencilState.compareFunctionFront;
    dstStencilState.compareFunctionBack = scrStencilState.compareFunctionBack;
  }
}
