import { SpriteRenderer } from "../2d";
import { Camera } from "../Camera";
import { Utils } from "../Utils";
import { RenderQueueType, Shader, ShaderProperty } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { Batcher2D } from "./batcher/Batcher2D";
import { RenderDataUsage } from "./enums/RenderDataUsage";

/**
 * Render queue.
 */
export class RenderQueue {
  private static _textureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SpriteTexture");

  /**
   * @internal
   */
  static _compareForOpaque(a: RenderElement, b: RenderElement): number {
    const dataA = a.data;
    const dataB = b.data;
    const componentA = dataA.component;
    const componentB = dataB.component;
    const priorityOrder = componentA.priority - componentB.priority;
    if (priorityOrder !== 0) {
      return priorityOrder;
    }
    // make suer from the same renderer.
    if (componentA.instanceId === componentB.instanceId) {
      return dataA.material._priority - dataB.material._priority;
    } else {
      const distanceDiff = componentA._distanceForSort - componentB._distanceForSort;
      if (distanceDiff === 0) {
        return componentA.instanceId - componentB.instanceId;
      } else {
        return distanceDiff;
      }
    }
  }

  /**
   * @internal
   */
  static _compareForTransparent(a: RenderElement, b: RenderElement): number {
    const dataA = a.data;
    const dataB = b.data;
    const componentA = dataA.component;
    const componentB = dataB.component;
    const priorityOrder = componentA.priority - componentB.priority;
    if (priorityOrder !== 0) {
      return priorityOrder;
    }
    // make suer from the same renderer.
    if (componentA.instanceId === componentB.instanceId) {
      return dataA.material._priority - dataB.material._priority;
    } else {
      const distanceDiff = componentB._distanceForSort - componentA._distanceForSort;
      if (distanceDiff === 0) {
        return componentA.instanceId - componentB.instanceId;
      } else {
        return distanceDiff;
      }
    }
  }

  readonly elements: RenderElement[] = [];
  readonly tempElements: RenderElement[] = [];

  private readonly _renderQueueType: RenderQueueType;

  constructor(renderQueueType: RenderQueueType) {
    this._renderQueueType = renderQueueType;
  }

  /**
   * Push a render element.
   */
  pushRenderElement(element: RenderElement): void {
    this.tempElements.push(element);
  }

  batch(batcher: Batcher2D): void {
    batcher.batch(this.tempElements, this.elements);
  }

  render(camera: Camera, pipelineStageTagValue: string): void {
    const { elements } = this;
    const len = elements.length;
    if (len === 0) {
      return;
    }

    const { engine, scene } = camera;
    const { _spriteMaskManager: spriteMaskManager } = engine;
    const { instanceId: cameraId, shaderData: cameraData } = camera;
    const { shaderData: sceneData, instanceId: sceneId } = scene;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this._renderQueueType;

    for (let i = 0; i < len; i++) {
      const element = elements[i];
      const { data, shaderPasses } = element;

      const { usage } = data;
      const needMask = usage === RenderDataUsage.Sprite || usage === RenderDataUsage.Text;
      const renderer = data.component;
      needMask && spriteMaskManager.preRender(camera, <SpriteRenderer>renderer);

      const compileMacros = Shader._compileMacros;
      const primitive = data.primitive;
      const material = data.material;
      const { shaderData: rendererData, instanceId: rendererId } = renderer;
      const { shaderData: materialData, instanceId: materialId, renderStates } = material;

      // TextRenderer may be has multi-texture.
      const isText = usage === RenderDataUsage.Text;
      // @ts-ignore
      isText && rendererData.setTexture(RenderQueue._textureProperty, data.texture);

      // union render global macro and material self macro.
      ShaderMacroCollection.unionCollection(renderer._globalShaderMacro, materialData._macroCollection, compileMacros);

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
          } else if (switchProgram || isText) {
            program.uploadTextures(program.rendererUniformBlock, rendererData);
          }

          if (program._uploadMaterialId !== materialId) {
            program.uploadAll(program.materialUniformBlock, materialData);
            program._uploadMaterialId = materialId;
          } else if (switchProgram) {
            program.uploadTextures(program.materialUniformBlock, materialData);
          }

          // We only consider switchProgram case, because UnGroup texture's value is always default.
          if (switchProgram) {
            program.uploadUnGroupTextures();
          }
        }

        const renderState = shaderPass._renderState ?? renderStates[j];
        renderState._apply(
          engine,
          renderer.entity.transform._isFrontFaceInvert(),
          shaderPass._renderStateDataMap,
          material.shaderData
        );

        rhi.drawPrimitive(primitive, data.subPrimitive, program);
      }
      needMask && spriteMaskManager.postRender(<SpriteRenderer>renderer);
    }
  }

  /**
   * Clear collection.
   */
  clear(): void {
    this.elements.length = 0;
    this.tempElements.length = 0;
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {}

  /**
   * Sort the elements.
   */
  sort(compareFunc: Function): void {
    Utils._quickSort(this.tempElements, 0, this.tempElements.length, compareFunc);
  }
}
