import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { Camera } from "../Camera";
import { Utils } from "../Utils";
import { RenderQueueType, Shader, StencilOperation } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { BatcherManager } from "./BatcherManager";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { SubRenderElement } from "./SubRenderElement";

/**
 * Render queue.
 */
export class RenderQueue {
  /** @internal */
  static _renderQueue: RenderQueue;
  /**
   * @internal
   */
  static _getRenderQueue(): RenderQueue {
    if (!RenderQueue._renderQueue) {
      RenderQueue._renderQueue = new RenderQueue(RenderQueueType.Transparent);
    }
    return RenderQueue._renderQueue;
  }

  /**
   * @internal
   */
  static _compareForOpaque(a: RenderElement, b: RenderElement): number {
    const dataA = a.data;
    const dataB = b.data;
    return dataA.priority - dataB.priority || dataA.distanceForSort - dataB.distanceForSort;
  }

  /**
   * @internal
   */
  static _compareForTransparent(a: RenderElement, b: RenderElement): number {
    const dataA = a.data;
    const dataB = b.data;
    return dataA.priority - dataB.priority || dataB.distanceForSort - dataA.distanceForSort;
  }

  readonly elements: RenderElement[] = [];
  readonly batchedSubElements: SubRenderElement[] = [];

  private _renderQueueType: RenderQueueType;

  constructor(renderQueueType: RenderQueueType) {
    this._renderQueueType = renderQueueType;
  }

  /**
   * Push a render element.
   */
  pushRenderElement(element: RenderElement): void {
    this.elements.push(element);
  }

  /**
   * Process render elements, include sort, insert mask element and batch.
   */
  processRenderElements(compareFunc: Function, batcherManager: BatcherManager): void {
    this._sort(compareFunc);
    this._batch(batcherManager);
  }

  render(camera: Camera, pipelineStageTagValue: string, isMask: boolean = false): void {
    const batchedSubElements = this.batchedSubElements;
    const length = batchedSubElements.length;
    if (length === 0) {
      return;
    }

    const { engine, scene, instanceId: cameraId, shaderData: cameraData } = camera;
    const { shaderData: sceneData, instanceId: sceneId } = scene;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this._renderQueueType;

    for (let i = 0; i < length; i++) {
      const subElement = batchedSubElements[i];
      subElement.component._maskInteraction !== SpriteMaskInteraction.None &&
        this._drawMask(subElement, camera, pipelineStageTagValue);

      const { shaderPasses } = subElement;
      const compileMacros = Shader._compileMacros;
      const primitive = subElement.primitive;
      const renderer = subElement.component;
      const material = subElement.material;
      const renderElementRenderData = subElement.shaderData;
      const { shaderData: rendererData, instanceId: rendererId } = renderer;
      const { shaderData: materialData, instanceId: materialId, renderStates } = material;

      // union render global macro and material self macro.
      ShaderMacroCollection.unionCollection(renderer._globalShaderMacro, materialData._macroCollection, compileMacros);

      // TODO: Mask should not modify material's render state
      if (isMask) {
        const stencilState = material.renderState.stencilState;
        const stencilOperation = subElement.stencilOperation || StencilOperation.Keep;
        stencilState.passOperationFront = stencilOperation;
        stencilState.passOperationBack = stencilOperation;
      }

      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass.getTagValue(pipelineStageKey) !== pipelineStageTagValue) {
          continue;
        }

        if ((shaderPass._renderState ?? renderStates[j]).renderQueueType !== renderQueueType) {
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
          renderElementRenderData && program.uploadAll(program.renderElementUniformBlock, renderElementRenderData);
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

          renderElementRenderData && program.uploadAll(program.renderElementUniformBlock, renderElementRenderData);

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
          material.shaderData
        );

        rhi.drawPrimitive(primitive, subElement.subPrimitive, program);
      }
    }
  }

  /**
   * Clear collection.
   */
  clear(): void {
    this.elements.length = 0;
    this.batchedSubElements.length = 0;
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {}

  /**
   * @internal
   */
  _setRenderQueueType(type: RenderQueueType): void {
    this._renderQueueType = type;
  }

  /**
   * Sort the elements.
   */
  private _sort(compareFunc: Function): void {
    Utils._quickSort(this.elements, 0, this.elements.length, compareFunc);
  }

  /**
   * Batch the elements.
   */
  private _batch(batcherManager: BatcherManager): void {
    batcherManager.batch(this.elements, this.batchedSubElements);
  }

  private _drawMask(element: SubRenderElement, camera: Camera, pipelineStageTagValue: string): void {
    const renderQueue = RenderQueue._getRenderQueue();
    renderQueue._setRenderQueueType(this._renderQueueType);
    renderQueue.clear();
    const engine = camera.engine;
    engine._maskManager.buildMaskRenderElement(element, renderQueue);
    renderQueue._batch(engine._batcherManager);
    renderQueue.render(camera, pipelineStageTagValue, true);
  }
}
