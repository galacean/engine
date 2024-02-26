import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { Utils } from "../Utils";
import { RenderQueueType, Shader } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { SpriteBatcher } from "./SpriteBatcher";

/**
 * Render queue.
 */
export class RenderQueue {
  /**
   * @internal
   */
  static _compareFromNearToFar(a: RenderElement, b: RenderElement): number {
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
  static _compareFromFarToNear(a: RenderElement, b: RenderElement): number {
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

  private _spriteBatcher: SpriteBatcher;
  private readonly _renderQueueType: RenderQueueType;

  constructor(engine: Engine, renderQueueType: RenderQueueType) {
    this._initSpriteBatcher(engine);
    this._renderQueueType = renderQueueType;
  }

  /**
   * Push a render element.
   */
  pushRenderElement(element: RenderElement): void {
    this.elements.push(element);
  }

  render(camera: Camera, pipelineStageTagValue: string): void {
    const elements = this.elements;
    if (elements.length === 0) {
      return;
    }

    const { engine, scene } = camera;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const sceneData = scene.shaderData;
    const cameraData = camera.shaderData;
    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this._renderQueueType;

    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      const { data, shaderPasses } = element;

      if (data.primitive) {
        this._spriteBatcher.flush(camera);

        const compileMacros = Shader._compileMacros;
        const primitive = data.primitive;
        const renderer = data.component;
        const material = data.material;
        const rendererData = renderer.shaderData;
        const materialData = material.shaderData;
        const renderStates = material.renderStates;

        // union render global macro and material self macro.
        ShaderMacroCollection.unionCollection(
          renderer._globalShaderMacro,
          materialData._macroCollection,
          compileMacros
        );

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
            program._uploadScene = scene;
            program._uploadCamera = camera;
            program._uploadRenderer = renderer;
            program._uploadMaterial = material;
            program._uploadRenderCount = renderCount;
          } else {
            if (program._uploadScene !== scene) {
              program.uploadAll(program.sceneUniformBlock, sceneData);
              program._uploadScene = scene;
            } else if (switchProgram) {
              program.uploadTextures(program.sceneUniformBlock, sceneData);
            }

            if (program._uploadCamera !== camera) {
              program.uploadAll(program.cameraUniformBlock, cameraData);
              program._uploadCamera = camera;
            } else if (switchProgram) {
              program.uploadTextures(program.cameraUniformBlock, cameraData);
            }

            if (program._uploadRenderer !== renderer) {
              program.uploadAll(program.rendererUniformBlock, rendererData);
              program._uploadRenderer = renderer;
            } else if (switchProgram) {
              program.uploadTextures(program.rendererUniformBlock, rendererData);
            }

            if (program._uploadMaterial !== material) {
              program.uploadAll(program.materialUniformBlock, materialData);
              program._uploadMaterial = material;
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
      } else {
        this._spriteBatcher.drawElement(element, camera);
      }
    }

    this._spriteBatcher.flush(camera);
  }

  /**
   * Clear collection.
   */
  clear(): void {
    this.elements.length = 0;
    this._spriteBatcher.clear();
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    this._spriteBatcher.destroy();
    this._spriteBatcher = null;
  }

  /**
   * Sort the elements.
   */
  sort(compareFunc: Function): void {
    Utils._quickSort(this.elements, 0, this.elements.length, compareFunc);
  }

  /**
   * @internal
   * Standalone for CanvasRenderer plugin.
   */
  _initSpriteBatcher(engine: Engine): void {
    this._spriteBatcher = new SpriteBatcher(engine);
  }
}
