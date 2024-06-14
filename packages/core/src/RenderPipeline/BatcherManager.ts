import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { PrimitiveChunkManager } from "./PrimitiveChunkManager";
import { RenderContext } from "./RenderContext";
import { RenderData } from "./RenderData";
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

  commitRenderData(context: RenderContext, data: RenderData): void {
    context.camera._renderPipeline.pushRenderData(context, data);
  }

  batch(elements: Array<RenderElement>, batchedSubElements: Array<SubRenderElement>): void {
    const length = elements.length;
    if (length === 0) {
      return;
    }

    let preSubElement: SubRenderElement;
    let preRenderer: Renderer;
    let preConstructor: Function;
    for (let i = 0; i < length; ++i) {
      const subElements = elements[i].data.subRenderElements;
      for (let j = 0, n = subElements.length; j < n; ++j) {
        const curSubElement = subElements[j];
        const curRenderer = curSubElement.component;
        const curConstructor = curRenderer.constructor;
        if (preSubElement) {
          if (preConstructor === curConstructor && preRenderer._canBatch(preSubElement, curSubElement)) {
            preRenderer._batchRenderElement(preSubElement, curSubElement);
          } else {
            batchedSubElements.push(preSubElement);
            preSubElement = curSubElement;
            preRenderer = curRenderer;
            preConstructor = curConstructor;
            preRenderer._batchRenderElement(preSubElement);
          }
        } else {
          preSubElement = curSubElement;
          preRenderer = curRenderer;
          preConstructor = curConstructor;
          preRenderer._batchRenderElement(preSubElement);
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
