import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { RenderQueueFlags } from "./BasicRenderPipeline";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderQueue } from "./RenderQueue";
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

  batch(renderQueue: RenderQueue): void {
    const { elements, batchedSubElements, renderQueueType } = renderQueue;
    let preSubElement: SubRenderElement;
    let preRenderer: Renderer;
    let preConstructor: Function;
    for (let i = 0, n = elements.length; i < n; ++i) {
      const subElements = elements[i].subRenderElements;
      for (let j = 0, m = subElements.length; j < m; ++j) {
        const subElement = subElements[j];

        // Some sub render elements may not belong to the current render queue
        if (!(subElement.renderQueueFlags & (<RenderQueueFlags>(1 << renderQueueType)))) {
          continue;
        }

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
