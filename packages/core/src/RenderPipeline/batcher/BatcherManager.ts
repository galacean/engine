import { Engine } from "../../Engine";
import { Renderer } from "../../Renderer";
import { RenderContext } from "../RenderContext";
import { RenderData } from "../RenderData";
import { RenderElement } from "../RenderElement";
import { RenderDataUsage } from "../enums/RenderDataUsage";
import { Batcher2D } from "./Batcher2D";

export class BatcherManager {
  /** @internal */
  _engine: Engine;
  /** @internal */
  _batcher2D: Batcher2D;

  constructor(engine: Engine) {
    this._engine = engine;
    this._batcher2D = new Batcher2D(engine);
  }

  destroy() {
    this._batcher2D.destroy();
    this._batcher2D = null;
    this._engine = null;
  }

  commitRenderData(context: RenderContext, data: RenderData): void {
    switch (data.usage) {
      case RenderDataUsage.Mesh:
      case RenderDataUsage.Sprite:
      case RenderDataUsage.Text:
        context.camera._renderPipeline.pushRenderData(context, data);
        break;
      default:
        break;
    }
  }

  batch(elements: Array<RenderElement>, batchedElements: Array<RenderElement>): void {
    const len = elements.length;
    if (len === 0) {
      return;
    }

    let preElement: RenderElement;
    let preRenderer: Renderer;
    let preUsage: RenderDataUsage;
    for (let i = 0; i < len; ++i) {
      const curElement = elements[i];
      const curRenderer = curElement.data.component;

      if (preElement) {
        // @ts-ignore
        if (preUsage === curElement.data.usage && preRenderer._canBatch(preElement, curElement)) {
          // @ts-ignore
          preRenderer._batchRenderElement(preElement, curElement);
        } else {
          batchedElements.push(preElement);
          preElement = curElement;
          preRenderer = curRenderer;
          preUsage = curElement.data.usage;
          // @ts-ignore
          preRenderer._batchRenderElement(preElement);
        }
      } else {
        preElement = curElement;
        preRenderer = curRenderer;
        preUsage = curElement.data.usage;
        // @ts-ignore
        preRenderer._batchRenderElement(preElement);
      }
    }
    preElement && batchedElements.push(preElement);
  }

  uploadBuffer() {
    // @ts-ignore
    this._batcher2D._uploadBuffer();
  }

  clear() {
    this._batcher2D.clear();
  }
}
