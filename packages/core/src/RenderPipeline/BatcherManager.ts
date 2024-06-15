import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderElement } from "./RenderElement";
import { SubRenderElement } from "./SubRenderElement";

export class BatcherManager {
  /** @internal */
  _engine: Engine;
  /** @internal */
  _primitiveChunkManager2D: PrimitiveChunkManager;
  /** @internal */
  _primitiveChunkManagerMask: PrimitiveChunkManager;

  constructor(engine: Engine) {
    this._engine = engine;
    this._primitiveChunkManager2D = new PrimitiveChunkManager(engine);
    this._primitiveChunkManagerMask = new PrimitiveChunkManager(engine, 128);
  }

  destroy() {
    this._primitiveChunkManager2D.destroy();
    this._primitiveChunkManager2D = null;
    this._primitiveChunkManagerMask.destroy();
    this._primitiveChunkManagerMask = null;
    this._engine = null;
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
            preRenderer._batch(preSubElement);
            preSubElement.batched = false;
          }
        } else {
          preSubElement = subElement;
          preRenderer = renderer;
          preConstructor = constructor;
          preRenderer._batch(preSubElement);
          preSubElement.batched = false;
        }
      }
    }
    preSubElement && batchedSubElements.push(preSubElement);
  }

  uploadBuffer() {
    this._primitiveChunkManager2D.uploadBuffer();
    this._primitiveChunkManagerMask.uploadBuffer();
  }
}
