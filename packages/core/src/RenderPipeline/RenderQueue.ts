import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { Utils } from "../Utils";
import { RenderQueueType, Shader, StencilOperation } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { BatcherManager } from "./BatcherManager";
import { MaskManager } from "./MaskManager";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class RenderQueue {
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
    maskType: RenderQueueMaskType = RenderQueueMaskType.No
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
    const renderQueueType = this.renderQueueType;
    scene._maskManager.preMaskLayer = 0;

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

      renderer._maskInteraction !== SpriteMaskInteraction.None &&
        this._drawMask(context, pipelineStageTagValue, subElement);

      const compileMacros = Shader._compileMacros;
      const { primitive, material, shaderPasses, shaderData: renderElementShaderData } = subElement;
      const { shaderData: rendererData, instanceId: rendererId } = renderer;
      const { shaderData: materialData, instanceId: materialId, renderStates } = material;

      // Union render global macro and material self macro
      ShaderMacroCollection.unionCollection(renderer._globalShaderMacro, materialData._macroCollection, compileMacros);

      // TODO: Mask should not modify material's render state, will delete this code after mask refactor
      if (maskType !== RenderQueueMaskType.No) {
        const operation =
          maskType === RenderQueueMaskType.Increment
            ? StencilOperation.IncrementSaturate
            : StencilOperation.DecrementSaturate;

        const { stencilState } = material.renderState;
        stencilState.passOperationFront = operation;
        stencilState.passOperationBack = operation;
      }

      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass.getTagValue(pipelineStageKey) !== pipelineStageTagValue) {
          continue;
        }

        let renderState = shaderPass._renderState;
        let passQueueType: RenderQueueType;
        if (renderState) {
          passQueueType = renderState._getRenderQueueByShaderData(shaderPass._renderStateDataMap, materialData);
        } else {
          renderState = renderStates[j];
          passQueueType = renderState.renderQueueType;
        }

        if (passQueueType !== renderQueueType) {
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

        renderState._applyStates(
          engine,
          renderer.entity.transform._isFrontFaceInvert(),
          shaderPass._renderStateDataMap,
          material.shaderData
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

    const decrementMaskQueue = MaskManager.getMaskDecrementRenderQueue();
    decrementMaskQueue.renderQueueType = this.renderQueueType;

    const camera = context.camera;
    const engine = camera.engine;
    camera.scene._maskManager.buildMaskRenderElement(master, incrementMaskQueue, decrementMaskQueue);

    const primitiveChunkManagerMask = engine._batcherManager.primitiveChunkManagerMask;
    incrementMaskQueue._batch(engine._batcherManager);
    primitiveChunkManagerMask.uploadBuffer();
    incrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Increment);
    incrementMaskQueue.clear();
    decrementMaskQueue._batch(engine._batcherManager);
    primitiveChunkManagerMask.uploadBuffer();
    decrementMaskQueue.render(context, pipelineStageTagValue, RenderQueueMaskType.Decrement);
    decrementMaskQueue.clear();
  }
}

enum RenderQueueMaskType {
  No,
  Increment,
  Decrement
}
