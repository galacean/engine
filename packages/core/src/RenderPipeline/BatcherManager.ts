import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderQueue } from "./RenderQueue";
import { SubRenderElement } from "./SubRenderElement";

/**
 * @internal
 */
export class BatcherManager {
  private _primitiveChunkManager2D: PrimitiveChunkManager;
  private _primitiveChunkManagerMask: PrimitiveChunkManager;
  private _primitiveChunkManagerUI: PrimitiveChunkManager;

  constructor(public engine: Engine) {}

  get primitiveChunkManager2D(): PrimitiveChunkManager {
    return (this._primitiveChunkManager2D ||= new PrimitiveChunkManager(this.engine));
  }

  get primitiveChunkManagerMask(): PrimitiveChunkManager {
    return (this._primitiveChunkManagerMask ||= new PrimitiveChunkManager(this.engine, 128));
  }

  get primitiveChunkManagerUI(): PrimitiveChunkManager {
    return (this._primitiveChunkManagerUI ||= new PrimitiveChunkManager(this.engine));
  }

  destroy() {
    if (this._primitiveChunkManager2D) {
      this._primitiveChunkManager2D.destroy();
      this._primitiveChunkManager2D = null;
    }
    if (this._primitiveChunkManagerMask) {
      this._primitiveChunkManagerMask.destroy();
      this._primitiveChunkManagerMask = null;
    }
    if (this._primitiveChunkManagerUI) {
      this._primitiveChunkManagerUI.destroy();
      this._primitiveChunkManagerUI = null;
    }
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
        if (!(subElement.renderQueueFlags & (1 << renderQueueType))) {
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
    this._primitiveChunkManager2D && this._primitiveChunkManager2D.uploadBuffer();
    this._primitiveChunkManagerMask && this._primitiveChunkManagerMask.uploadBuffer();
    this._primitiveChunkManagerUI && this._primitiveChunkManagerUI.uploadBuffer();
  }
}
