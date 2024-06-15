import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderElement } from "./RenderElement";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatcherManager {
  primitiveChunkManager2D: PrimitiveChunkManager;
  primitiveChunkManagerMask: PrimitiveChunkManager;

  constructor(engine: Engine) {
    this.primitiveChunkManager2D = new PrimitiveChunkManager(engine);
    this.primitiveChunkManagerMask = new PrimitiveChunkManager(engine, 128);
  }

  destroy() {
    this.primitiveChunkManager2D.destroy();
    this.primitiveChunkManagerMask.destroy();
    this.primitiveChunkManager2D = null;
    this.primitiveChunkManagerMask = null;
  }

  batch(elements: RenderElement[], batchedSubElements: SubRenderElement[]): void {
    let preSubElement: SubRenderElement;
    let preRenderer: Renderer;
    let preConstructor: Function;
    for (let i = 0, n = elements.length; i < n; ++i) {
      const subElements = elements[i].data.subRenderElements;
      for (let j = 0, m = subElements.length; j < m; ++j) {
        const subElement = subElements[j];
        const renderer = subElement.component;
        const constructor = renderer.constructor;
        if (preSubElement) {
          if (preConstructor === constructor && preRenderer._canBatch(preSubElement, subElement)) {
            preRenderer._batch(preSubElement, subElement);
            preSubElement.batched = true;
          } else {
            batchedSubElements.push(preSubElement);
            preSubElement = subElement;
            preRenderer = renderer;
            preConstructor = constructor;
            renderer._batch(subElement);
            subElement.batched = false;
          }
        } else {
          preSubElement = subElement;
          preRenderer = renderer;
          preConstructor = constructor;
          renderer._batch(subElement);
          subElement.batched = false;
        }
      }
    }
    preSubElement && batchedSubElements.push(preSubElement);
  }

  uploadBuffer() {
    this.primitiveChunkManager2D.uploadBuffer();
    this.primitiveChunkManagerMask.uploadBuffer();
  }
}
