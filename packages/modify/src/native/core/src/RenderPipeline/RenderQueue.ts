import { ConstantBufferBindingPoint } from "../shader/enums/ConstantBufferBindingPoint";
import { SpriteMaskInteraction } from "../2d/enums/SpriteMaskInteraction";
import { BasicResources, RenderStateElementMap } from "../BasicResources";
import { Utils } from "../Utils";
import { SSRProgramResolver } from "../lighting/screenSpaceReflection/SSRProgramResolver";
import { RenderQueueType, Shader } from "../shader";
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
  private _cameraEngineMacros = new ShaderMacroCollection();

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
        if (shaderPass._pipelineStage !== pipelineStageTagValue) {
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

    const camera = context.camera;
    const { engine, instanceId: cameraId, shaderData: cameraData } = camera;
    const scene = camera.scene!;
    const { instanceId: sceneId, shaderData: sceneData, _maskManager: maskManager } = scene;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const realtimeSphericalHarmonicsBuffer = scene.ambientLight._realtimeSphericalHarmonicsBuffer;
    if (realtimeSphericalHarmonicsBuffer) {
      rhi.bindUniformBufferRange(
        ConstantBufferBindingPoint.RealtimeIBLSphericalHarmonics,
        realtimeSphericalHarmonicsBuffer._platformBuffer,
        0,
        9 * 16
      );
    }
    const renderQueueType = this.renderQueueType;
    const needMaskType = maskType !== RenderQueueMaskType.No;
    const ssrState = context._ssrState;
    const ssrForwardActive = pipelineStageTagValue === PipelineStage.Forward && ssrState.enabled;
    const isSSRReceiverStage = pipelineStageTagValue === PipelineStage.SSRReceiver;
    const cameraEngineMacros = this._cameraEngineMacros;
    ShaderMacroCollection.unionCollection(
      context.camera._globalShaderMacro,
      engine._macroCollection,
      cameraEngineMacros
    );
    const compileMacros = Shader._compileMacros;

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
          if (maskManager.hasActiveMaskLayer && maskManager.isReadStencil(material)) {
            maskManager.clearMask(context, pipelineStageTagValue);
          }
        }
        if (!maskManager.hasStencilWritten && maskManager.isStencilWritten(material))
          maskManager.hasStencilWritten = true;
      }

      const { shaderData: renderElementShaderData } = curElement;
      const shaderPasses = curElement.subShader._getPassesForStage(pipelineStageTagValue);
      const { shaderData: rendererData } = component;
      const { shaderData: materialData } = material;

      const allowSSRForElement = ssrForwardActive && material._canReceiveScreenSpaceReflection(ssrState.maxRoughness);

      let macrosBuilt = false;
      let frontFaceInvert: boolean | undefined;
      for (let j = 0, m = shaderPasses.length; j < m; j++) {
        const shaderPass = shaderPasses[j];
        const renderState = shaderPass._renderState;
        if (!needMaskType) {
          const passQueueType = renderState._getRenderQueueByShaderData(shaderPass._renderStateDataMap, materialData);
          if (passQueueType !== renderQueueType) {
            continue;
          }
        }

        if (!macrosBuilt) {
          ShaderMacroCollection.unionCollection(cameraEngineMacros, rendererData._macroCollection, compileMacros);
          ShaderMacroCollection.unionCollection(compileMacros, materialData._macroCollection, compileMacros);
          if (isInstanced) {
            compileMacros.enable(InstanceBuffer.gpuInstanceMacro);
          }
          macrosBuilt = true;
        }

        let program;
        if (allowSSRForElement) {
          program = SSRProgramResolver.resolveForwardProgram(
            engine,
            shaderPass,
            material,
            ssrState,
            compileMacros,
            curElement.primitive,
            rendererData,
            renderElementShaderData
          );
        } else {
          if (isSSRReceiverStage) {
            SSRProgramResolver.applyReceiverStageMacros(compileMacros, ssrState);
          }
          program = shaderPass._getShaderProgram(
            engine,
            compileMacros,
            undefined,
            curElement.primitive,
            rendererData,
            materialData,
            renderElementShaderData
          );
        }
        if (!program.isValid) {
          continue;
        }

        program.bindForDraw(context.camera, component, material, renderElementShaderData, isInstanced);
        const layout = program._instanceLayout;
        if (!isInstanced || layout) {
          program.uploadSharedUniforms(sceneData, cameraData, rendererData, materialData, renderElementShaderData);
        }

        // Apply render state
        if (frontFaceInvert === undefined) {
          frontFaceInvert = component._isFrontFaceInvert();
        }
        renderState._applyStates(
          engine,
          frontFaceInvert,
          shaderPass._renderStateDataMap,
          material.shaderData,
          customStates,
          renderElementShaderData
        );

        // Draw
        if (isInstanced && layout) {
          const { primitive, subPrimitive, instancedRenderers } = curElement;
          const totalCount = instancedRenderers.length;
          const maxCount = layout.instanceMaxCount;
          const instanceBuffer = engine._batcherManager.instanceBuffer;

          instanceBuffer.setLayout(layout);
          for (let start = 0; start < totalCount; start += maxCount) {
            const count = Math.min(maxCount, totalCount - start);
            instanceBuffer.upload(instancedRenderers, start, count, context, materialData, renderElementShaderData);
            primitive.instanceCount = count;
            rhi.drawPrimitive(primitive, subPrimitive, program._platformProgram);
          }
          primitive.instanceCount = 0;
        } else if (isInstanced) {
          // A single instance record may exceed the device's block size. The pass
          // selected its ordinary variant; each renderer now needs its own uniforms.
          const renderers = curElement.instancedRenderers;
          for (let k = 0; k < renderers.length; ++k) {
            const renderer = renderers[k];
            renderer._updateTransformShaderData(context, false);
            const data = renderer.shaderData;
            program.uploadAll(program.rendererUniformBlock, data);
            program.uploadSharedUniforms(sceneData, cameraData, data, materialData, renderElementShaderData);
            rhi.drawPrimitive(curElement.primitive, curElement.subPrimitive, program._platformProgram);
            program._uploadRendererId = renderer.instanceId;
          }
        } else {
          rhi.drawPrimitive(curElement.primitive, curElement.subPrimitive, program._platformProgram);
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
}
