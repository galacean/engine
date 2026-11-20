import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { BasicResources, RenderStateElementMap } from "../BasicResources";
import { Utils } from "../Utils";
import { RenderQueueType, Shader } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ConstantBufferBindingPoint } from "../shader/enums/ConstantBufferBindingPoint";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { BatcherManager } from "./BatcherManager";
import { InstanceBuffer } from "./InstanceBuffer";
import { ContextRendererUpdateFlag, RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { PipelineStage } from "./enums/PipelineStage";
import { RenderQueueMaskType } from "./enums/RenderQueueMaskType";

/**
 * @internal
 */
export class RenderQueue {
  private static _ssrEnableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
  private static _ssrVerifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
  private static _ssrBilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
  private static _ssrPackedDepthMacro = ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8");
  private static _ssrPackedNormalMacro = ShaderMacro.getByName("SSR_PACKED_NORMAL_OCT8");

  static compareForOpaque(a: RenderElement, b: RenderElement): number {
    return (
      a.priority - b.priority ||
      a.material.instanceId - b.material.instanceId ||
      a.primitive.instanceId - b.primitive.instanceId
    );
  }

  static compareForTransparent(a: RenderElement, b: RenderElement): number {
    return (
      a.priority - b.priority || b.distanceForSort - a.distanceForSort || a.subDistancePriority - b.subDistancePriority
    );
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
    batcherManager.batch(this.elements, this.batchedElements);
  }

  countElementsForStage(pipelineStageTagValue: string, filter?: (element: RenderElement) => boolean): number {
    const batchedElements = this.batchedElements;
    const length = batchedElements.length;
    if (length === 0) {
      return 0;
    }

    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this.renderQueueType;
    let count = 0;

    for (let i = 0; i < length; i++) {
      const element = batchedElements[i];
      if (filter && !filter(element)) {
        continue;
      }

      const shaderPasses = element.subShader.passes;
      const materialData = element.material.shaderData;
      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass.getTagValue(pipelineStageKey) !== pipelineStageTagValue) {
          continue;
        }
        const passQueueType = shaderPass._renderState._getRenderQueueByShaderData(
          shaderPass._renderStateDataMap,
          materialData
        );
        if (passQueueType === renderQueueType) {
          count++;
          break;
        }
      }
    }

    return count;
  }

  render(
    context: RenderContext,
    pipelineStageTagValue: string,
    maskType: RenderQueueMaskType = RenderQueueMaskType.No,
    overrideRenderStates?: RenderStateElementMap | null,
    filter?: (element: RenderElement) => boolean
  ): void {
    const batchedElements = this.batchedElements;
    const length = batchedElements.length;
    if (length === 0) {
      return;
    }

    const { engine, instanceId: cameraId, shaderData: cameraData } = context.camera;
    const scene = context.camera.scene!;
    const { instanceId: sceneId, shaderData: sceneData, _maskManager: maskManager } = scene;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const realtimeSphericalHarmonicsBuffer = scene.ambientLight._realtimeSphericalHarmonicsBuffer;
    if (realtimeSphericalHarmonicsBuffer) {
      rhi.bindUniformBufferBase(
        ConstantBufferBindingPoint.RealtimeIBLSphericalHarmonics,
        realtimeSphericalHarmonicsBuffer._platformBuffer
      );
    }
    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this.renderQueueType;
    const needMaskType = maskType !== RenderQueueMaskType.No;
    const isForwardStage = pipelineStageTagValue === PipelineStage.Forward;
    const isSSRReceiverStage = pipelineStageTagValue === PipelineStage.SSRReceiver;
    const cameraMacros = cameraData._macroCollection;
    const camSSREnable = cameraMacros.isEnable(RenderQueue._ssrEnableMacro);
    const camSSRVerifyDepth = cameraMacros.isEnable(RenderQueue._ssrVerifyDepthMacro);
    const camSSRBilateral = cameraMacros.isEnable(RenderQueue._ssrBilateralMacro);
    const camSSRPackedDepth = cameraMacros.isEnable(RenderQueue._ssrPackedDepthMacro);
    const camSSRPackedNormal = cameraMacros.isEnable(RenderQueue._ssrPackedNormalMacro);

    for (let i = 0; i < length; i++) {
      const curElement = batchedElements[i];
      if (filter && !filter(curElement)) {
        continue;
      }

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
      let customStates: RenderStateElementMap | null = null;

      if (needMaskType) {
        customStates = BasicResources.getMaskTypeRenderStates(maskType);
      } else if (overrideRenderStates) {
        customStates = overrideRenderStates;
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
      const { shaderData: materialData, instanceId: materialId } = material;

      // Build compile macros
      const compileMacros = Shader._compileMacros;
      ShaderMacroCollection.unionCollection(component._globalShaderMacro, materialData._macroCollection, compileMacros);
      ShaderMacroCollection.unionCollection(compileMacros, engine._macroCollection, compileMacros);

      if (isInstanced) {
        compileMacros.enable(InstanceBuffer.gpuInstanceMacro);
      }

      const allowSSRForElement = isForwardStage && camSSREnable && material.screenSpaceReflectionIntensity > 0;

      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        if (shaderPass.getTagValue(pipelineStageKey) !== pipelineStageTagValue) {
          continue;
        }

        const renderState = shaderPass._renderState;
        if (!needMaskType) {
          const passQueueType = renderState._getRenderQueueByShaderData(shaderPass._renderStateDataMap, materialData);
          if (passQueueType !== renderQueueType) {
            continue;
          }
        }

        let useBilateral = false;
        if (isForwardStage) {
          const allowBilateral = material.screenSpaceReflectionBilateral !== false;
          useBilateral = allowSSRForElement && camSSRBilateral && allowBilateral;
          const useVerifyDepth =
            allowSSRForElement && !useBilateral && (camSSRVerifyDepth || (camSSRBilateral && !allowBilateral));
          RenderQueue._syncMacro(compileMacros, RenderQueue._ssrEnableMacro, allowSSRForElement);
          RenderQueue._syncMacro(compileMacros, RenderQueue._ssrVerifyDepthMacro, useVerifyDepth);
          RenderQueue._syncMacro(compileMacros, RenderQueue._ssrBilateralMacro, useBilateral);
          RenderQueue._syncMacro(
            compileMacros,
            RenderQueue._ssrPackedDepthMacro,
            allowSSRForElement && camSSRPackedDepth
          );
          RenderQueue._syncMacro(
            compileMacros,
            RenderQueue._ssrPackedNormalMacro,
            allowSSRForElement && camSSRPackedNormal
          );
        } else if (isSSRReceiverStage) {
          RenderQueue._syncMacro(compileMacros, RenderQueue._ssrPackedDepthMacro, camSSRPackedDepth);
          RenderQueue._syncMacro(compileMacros, RenderQueue._ssrPackedNormalMacro, camSSRPackedNormal);
        }

        let program = shaderPass._getShaderProgram(engine, compileMacros);
        if (allowSSRForElement) {
          const maxUnits = rhi.capability.maxFragmentTextureUnits;
          const cachedFallback =
            program._ssrFallbackMaxUnits === maxUnits
              ? camSSRVerifyDepth
                ? program._ssrFallbackVerify
                : program._ssrFallbackNoVerify
              : null;
          if (cachedFallback) {
            program = cachedFallback;
          } else if (!program.isValid || program.activeTextureCount > maxUnits) {
            const rejectedProgram = program;
            const level1Delta = camSSRVerifyDepth ? 1 : 2;
            const canTryLevel1 =
              useBilateral && (!program.isValid || program.activeTextureCount - level1Delta <= maxUnits);
            if (canTryLevel1) {
              compileMacros.disable(RenderQueue._ssrBilateralMacro);
              if (camSSRVerifyDepth) {
                compileMacros.enable(RenderQueue._ssrVerifyDepthMacro);
              }
              program = shaderPass._getShaderProgram(engine, compileMacros);
            }
            if (!program.isValid || program.activeTextureCount > maxUnits) {
              compileMacros.disable(RenderQueue._ssrEnableMacro);
              compileMacros.disable(RenderQueue._ssrVerifyDepthMacro);
              compileMacros.disable(RenderQueue._ssrBilateralMacro);
              compileMacros.disable(RenderQueue._ssrPackedDepthMacro);
              compileMacros.disable(RenderQueue._ssrPackedNormalMacro);
              program = shaderPass._getShaderProgram(engine, compileMacros);
            }
            if (program.isValid && program !== rejectedProgram) {
              if (rejectedProgram._ssrFallbackMaxUnits !== maxUnits) {
                rejectedProgram._ssrFallbackVerify = null;
                rejectedProgram._ssrFallbackNoVerify = null;
                rejectedProgram._ssrFallbackMaxUnits = maxUnits;
              }
              if (camSSRVerifyDepth) {
                rejectedProgram._ssrFallbackVerify = program;
              } else {
                rejectedProgram._ssrFallbackNoVerify = program;
              }
            }
          }
        }
        if (!program.isValid) {
          continue;
        }

        const switchProgram = program.bind();
        const switchRenderCount = renderCount !== program._uploadRenderCount;

        // Upload uniforms (cache-aware per block). Renderer block carries plain samplers/arrays
        // even on the instanced path (GLSL forbids them in UBOs); `_canBatch` ensures the whole
        // batch agrees on those, so the leader's values are correct for the draw call
        if (switchRenderCount) {
          program.groupingOtherUniformBlock();
          program.uploadAll(program.sceneUniformBlock, sceneData);
          program.uploadAll(program.cameraUniformBlock, cameraData);
          program.uploadAll(program.rendererUniformBlock, rendererData);
          program._uploadRendererId = isInstanced ? -1 : rendererId;
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

          if (isInstanced) {
            // Different batches may have different leaders, re-upload every time
            program.uploadAll(program.rendererUniformBlock, rendererData);
            program._uploadRendererId = -1;
          } else if (program._uploadRendererId !== rendererId) {
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
          customStates,
          renderElementShaderData
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

    if (!filter) {
      this.rendererUpdateFlag = ContextRendererUpdateFlag.None;
    }
  }

  clear(): void {
    this.elements.length = 0;
    this.batchedElements.length = 0;
  }

  destroy(): void {}

  private static _syncMacro(collection: ShaderMacroCollection, macro: ShaderMacro, enabled: boolean): void {
    if (enabled) {
      collection.enable(macro);
    } else {
      collection.disable(macro);
    }
  }
}
