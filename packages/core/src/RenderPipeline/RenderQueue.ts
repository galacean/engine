import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { BasicResources, RenderStateElementMap } from "../BasicResources";
import { Utils } from "../Utils";
import { RenderQueueType, Shader } from "../shader";
import { ConstantBufferBindingPoint } from "../shader/enums/ConstantBufferBindingPoint";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { BatcherManager } from "./BatcherManager";
import { InstanceBuffer } from "./InstanceBuffer";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { RenderQueueMaskType } from "./enums/RenderQueueMaskType";

/**
 * @internal
 */
export class RenderQueue {
  static compareForOpaque(a: RenderElement, b: RenderElement): number {
    return (
      a.priority - b.priority ||
      a.material.instanceId - b.material.instanceId ||
      a.primitive.instanceId - b.primitive.instanceId
    );
  }

  static compareForTransparent(a: RenderElement, b: RenderElement): number {
    return a.priority - b.priority || b.distanceForSort - a.distanceForSort;
  }

  readonly elements = new Array<RenderElement>();
  readonly batchedElements = new Array<RenderElement>();
  rendererUpdateFlag = ContextRendererUpdateFlag.None;

  constructor(public renderQueueType: RenderQueueType) {}

  pushRenderElement(element: RenderElement): void {
    this.elements.push(element);
  }

  sortBatch(compareFunc: Function, batcherManager: BatcherManager): void {
    Utils._quickSort(this.elements, 0, this.elements.length, compareFunc);
    this.batch(batcherManager);
  }

  batch(batcherManager: BatcherManager): void {
    batcherManager.batch(this);
  }

  render(
    context: RenderContext,
    pipelineStageTagValue: string,
    maskType: RenderQueueMaskType = RenderQueueMaskType.No
  ): void {
    const batchedElements = this.batchedElements;
    const length = batchedElements.length;
    if (length === 0) {
      return;
    }

    const { engine, scene, instanceId: cameraId, shaderData: cameraData } = context.camera;
    const { instanceId: sceneId, shaderData: sceneData, _maskManager: maskManager } = scene;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this.renderQueueType;
    const needMaskType = maskType !== RenderQueueMaskType.No;

    for (let i = 0; i < length; i++) {
      const curElement = batchedElements[i];
      const { component, material } = curElement;
      const isInstanced = curElement.instancedRenderers.length > 0;

      // Update transform shader data
      // Instancing packs per-renderer transforms into the instance UBO at draw time, so skip here
      if (!isInstanced) {
        if (this.rendererUpdateFlag & ContextRendererUpdateFlag.WorldViewMatrix) {
          component._updateTransformShaderData(context, false);
        } else if (this.rendererUpdateFlag & ContextRendererUpdateFlag.ProjectionMatrix) {
          component._updateTransformShaderData(context, true);
        }
      }

      // Resolve mask render states
      const maskInteraction = component._maskInteraction;
      const needMaskInteraction = maskInteraction !== SpriteMaskInteraction.None;
      let customStates: RenderStateElementMap = null;

      if (needMaskType) {
        customStates = BasicResources.getMaskTypeRenderStates(maskType);
      } else {
        if (needMaskInteraction) {
          maskManager.drawMask(context, pipelineStageTagValue, component._maskLayer);
          customStates = BasicResources.getMaskInteractionRenderStates(maskInteraction);
        } else {
          maskManager.isReadStencil(material) && maskManager.clearMask(context, pipelineStageTagValue);
        }
        maskManager.isStencilWritten(material) && (maskManager.hasStencilWritten = true);
      }

      const { shaderData: renderElementShaderData } = curElement;
      const shaderPasses = curElement.subShader.passes;
      const { shaderData: rendererData, instanceId: rendererId } = component;
      const { shaderData: materialData, instanceId: materialId, renderStates } = material;

      // Build compile macros
      const compileMacros = Shader._compileMacros;
      ShaderMacroCollection.unionCollection(component._globalShaderMacro, materialData._macroCollection, compileMacros);
      ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);

      if (isInstanced) {
        compileMacros.enable(InstanceBuffer.gpuInstanceMacro);
      }

      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass.getTagValue(pipelineStageKey) !== pipelineStageTagValue) {
          continue;
        }

        // Pick render state and filter by queue type
        let renderState = shaderPass._renderState;
        if (needMaskType) {
          // Mask don't care render queue type
          if (!renderState) {
            renderState = renderStates[j];
          }
        } else {
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
        }

        const program = shaderPass._getShaderProgram(engine, compileMacros);
        if (!program.isValid) {
          continue;
        }

        const switchProgram = program.bind();
        const switchRenderCount = renderCount !== program._uploadRenderCount;

        // Upload uniforms (cache-aware per block)
        if (switchRenderCount) {
          program.groupingOtherUniformBlock();
          program.uploadAll(program.sceneUniformBlock, sceneData);
          program.uploadAll(program.cameraUniformBlock, cameraData);
          if (isInstanced) {
            program._uploadRendererId = -1;
          } else {
            program.uploadAll(program.rendererUniformBlock, rendererData);
            program._uploadRendererId = rendererId;
          }
          program.uploadAll(program.materialUniformBlock, materialData);
          renderElementShaderData && program.uploadAll(program.renderElementUniformBlock, renderElementShaderData);
          // UnGroup textures should upload default value, texture uint maybe change by logic of texture bind
          program.uploadUnGroupTextures();
          program._uploadSceneId = sceneId;
          program._uploadCameraId = cameraId;
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

          if (!isInstanced) {
            if (program._uploadRendererId !== rendererId) {
              program.uploadAll(program.rendererUniformBlock, rendererData);
              program._uploadRendererId = rendererId;
            } else if (switchProgram) {
              program.uploadTextures(program.rendererUniformBlock, rendererData);
            }
          }

          if (program._uploadMaterialId !== materialId) {
            program.uploadAll(program.materialUniformBlock, materialData);
            program._uploadMaterialId = materialId;
          } else if (switchProgram) {
            program.uploadTextures(program.materialUniformBlock, materialData);
          }

          renderElementShaderData && program.uploadAll(program.renderElementUniformBlock, renderElementShaderData);

          // We only consider switchProgram case, because UnGroup texture's value is always default
          if (switchProgram) {
            program.uploadUnGroupTextures();
          }
        }

        // Apply render state
        renderState._applyStates(
          engine,
          component._isFrontFaceInvert(),
          shaderPass._renderStateDataMap,
          material.shaderData,
          customStates
        );

        // Draw
        const layout = program._instanceLayout;
        if (isInstanced && layout) {
          const { primitive, subPrimitive, instancedRenderers } = curElement;
          const totalCount = instancedRenderers.length;
          const maxCount = layout.instanceMaxCount;
          const instanceBuffer = engine._batcherManager.instanceBuffer;

          instanceBuffer.setLayout(layout);
          rhi.bindUniformBufferBase(ConstantBufferBindingPoint.RendererInstance, instanceBuffer.buffer._platformBuffer);
          for (let start = 0; start < totalCount; start += maxCount) {
            const count = Math.min(maxCount, totalCount - start);
            instanceBuffer.upload(instancedRenderers, start, count);
            primitive.instanceCount = count;
            rhi.drawPrimitive(primitive, subPrimitive, program);
          }
          primitive.instanceCount = 0;
        } else {
          rhi.drawPrimitive(curElement.primitive, curElement.subPrimitive, program);
        }
      }
    }

    this.rendererUpdateFlag = ContextRendererUpdateFlag.None;
  }

  clear(): void {
    this.elements.length = 0;
    this.batchedElements.length = 0;
  }

  destroy(): void {}
}
