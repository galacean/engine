import { SpriteRenderer } from "../2d";
import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { RenderQueueType, Shader } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { RenderDataUsage } from "./enums/RenderDataUsage";

/**
 * Render queue.
 */
export class RenderQueue {
  /**
   * @internal
   */
  static _compareFromNearToFar(a: RenderElement, b: RenderElement): number {
    return (
      a.data.component.priority - b.data.component.priority ||
      a.data.component._distanceForSort - b.data.component._distanceForSort
    );
  }

  /**
   * @internal
   */
  static _compareFromFarToNear(a: RenderElement, b: RenderElement): number {
    return (
      a.data.component.priority - b.data.component.priority ||
      b.data.component._distanceForSort - a.data.component._distanceForSort
    );
  }

  readonly elements: RenderElement[] = [];

  private readonly _renderQueueType: RenderQueueType;

  constructor(engine: Engine, renderQueueType: RenderQueueType) {
    this._renderQueueType = renderQueueType;
  }

  /**
   * Push a render element.
   */
  pushRenderElement(element: RenderElement): void {
    this.elements.push(element);
  }

  render(camera: Camera, mask: Layer, pipelineStageTagValue: string): void {
    const elements = this.elements;
    if (elements.length === 0) {
      return;
    }

    const { engine, scene } = camera;
    const { _spriteMaskManager: spriteMaskManager } = camera.engine;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const sceneData = scene.shaderData;
    const cameraData = camera.shaderData;
    const pipelineStageKey = RenderContext.pipelineStageKey;
    const renderQueueType = this._renderQueueType;

    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      const { data, shaderPasses } = element;

      const renderPassFlag = data.component.entity.layer;

      if (!(renderPassFlag & mask)) {
        continue;
      }

      const isSprite = data.usage === RenderDataUsage.Sprite;
      const renderer = data.component;
      isSprite && spriteMaskManager.preRender(camera, <SpriteRenderer>renderer);

      const compileMacros = Shader._compileMacros;
      const primitive = data.primitive;
      const material = data.material;
      const rendererData = renderer.shaderData;
      const materialData = material.shaderData;
      const renderStates = material.renderStates;

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
      isSprite && spriteMaskManager.postRender(<SpriteRenderer>renderer);
    }
  }

  /**
   * Clear collection.
   */
  clear(): void {
    this.elements.length = 0;
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {}

  /**
   * Sort the elements.
   */
  sort(compareFunc: Function): void {
    this._quickSort(this.elements, 0, this.elements.length, compareFunc);
  }

  /**
   * @remarks
   * Modified based on v8.
   * https://github.com/v8/v8/blob/7.2-lkgr/src/js/array.js
   */
  private _quickSort<T>(a: T[], from: number, to: number, compareFunc: Function): void {
    while (true) {
      // Insertion sort is faster for short arrays.
      if (to - from <= 10) {
        this._insertionSort(a, from, to, compareFunc);
        return;
      }
      const third_index = (from + to) >> 1;
      // Find a pivot as the median of first, last and middle element.
      let v0 = a[from];
      let v1 = a[to - 1];
      let v2 = a[third_index];
      const c01 = compareFunc(v0, v1);
      if (c01 > 0) {
        // v1 < v0, so swap them.
        const tmp = v0;
        v0 = v1;
        v1 = tmp;
      } // v0 <= v1.
      const c02 = compareFunc(v0, v2);
      if (c02 >= 0) {
        // v2 <= v0 <= v1.
        const tmp = v0;
        v0 = v2;
        v2 = v1;
        v1 = tmp;
      } else {
        // v0 <= v1 && v0 < v2
        const c12 = compareFunc(v1, v2);
        if (c12 > 0) {
          // v0 <= v2 < v1
          const tmp = v1;
          v1 = v2;
          v2 = tmp;
        }
      }
      // v0 <= v1 <= v2
      a[from] = v0;
      a[to - 1] = v2;
      const pivot = v1;
      let low_end = from + 1; // Upper bound of elements lower than pivot.
      let high_start = to - 1; // Lower bound of elements greater than pivot.
      a[third_index] = a[low_end];
      a[low_end] = pivot;

      // From low_end to i are elements equal to pivot.
      // From i to high_start are elements that haven't been compared yet.
      partition: for (let i = low_end + 1; i < high_start; i++) {
        let element = a[i];
        let order = compareFunc(element, pivot);
        if (order < 0) {
          a[i] = a[low_end];
          a[low_end] = element;
          low_end++;
        } else if (order > 0) {
          do {
            high_start--;
            if (high_start == i) break partition;
            const top_elem = a[high_start];
            order = compareFunc(top_elem, pivot);
          } while (order > 0);
          a[i] = a[high_start];
          a[high_start] = element;
          if (order < 0) {
            element = a[i];
            a[i] = a[low_end];
            a[low_end] = element;
            low_end++;
          }
        }
      }
      if (to - high_start < low_end - from) {
        this._quickSort(a, high_start, to, compareFunc);
        to = low_end;
      } else {
        this._quickSort(a, from, low_end, compareFunc);
        from = high_start;
      }
    }
  }

  private _insertionSort<T>(a: T[], from: number, to: number, compareFunc: Function): void {
    for (let i = from + 1; i < to; i++) {
      let j;
      const element = a[i];
      for (j = i - 1; j >= from; j--) {
        const tmp = a[j];
        const order = compareFunc(tmp, element);
        if (order > 0) {
          a[j + 1] = tmp;
        } else {
          break;
        }
      }
      a[j + 1] = element;
    }
  }
}
