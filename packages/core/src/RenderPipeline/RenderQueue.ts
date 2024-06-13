import { Camera } from "../Camera";
import { Utils } from "../Utils";
import { RenderQueueType, Shader, StencilOperation } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { BatcherManager } from "./BatcherManager";
import { MaskManager } from "./MaskManager";
import { SubRenderElement } from "./SubRenderElement";

/**
 * Render queue.
 */
export class RenderQueue {
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
  readonly maskInsertedElements: RenderElement[] = [];
  readonly batchedSubElements: SubRenderElement[] = [];

  private readonly _renderQueueType: RenderQueueType;

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
  processRenderElements(compareFunc: Function, maskManager: MaskManager, batcherManager: BatcherManager): void {
    this._sort(compareFunc);
    this._insertMask(maskManager);
    this._batch(batcherManager);
  }

  render(camera: Camera, pipelineStageTagValue: string): void {
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

      // Update stencil state
      const stencilState = material.renderState.stencilState;
      //@ts-ignore
      const stencilOperation = subElement.stencilOperation || StencilOperation.Keep;
      stencilState.passOperationFront = stencilOperation;
      stencilState.passOperationBack = stencilOperation;

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
    this.maskInsertedElements.length = 0;
    this.batchedSubElements.length = 0;
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {}

  /**
   * Sort the elements.
   */
  private _sort(compareFunc: Function): void {
    Utils._quickSort(this.elements, 0, this.elements.length, compareFunc);
  }

  /**
   * Insert mask for elements who need.
   */
  private _insertMask(maskManager: MaskManager): void {
    maskManager.insertMask(this.elements, this.maskInsertedElements);
  }

  /**
   * Batch the elements.
   */
  private _batch(batcherManager: BatcherManager): void {
    batcherManager.batch(this.maskInsertedElements, this.batchedSubElements);
  }
}
