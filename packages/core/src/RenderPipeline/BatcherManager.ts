import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { RenderContext } from "./RenderContext";
import { RenderData } from "./RenderData";
import { RenderElement } from "./RenderElement";
import { RenderDataUsage } from "./enums/RenderDataUsage";
import { DynamicGeometryDataManager } from "./DynamicGeometryDataManager";

export class BatcherManager {
  /** @internal */
  _engine: Engine;
  /** @internal */
  _dynamicGeometryDataManager2D: DynamicGeometryDataManager;

  constructor(engine: Engine) {
    this._engine = engine;
    this._dynamicGeometryDataManager2D = new DynamicGeometryDataManager(engine);
  }

  destroy() {
    this._dynamicGeometryDataManager2D.destroy();
    this._dynamicGeometryDataManager2D = null;
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
    this._dynamicGeometryDataManager2D.uploadBuffer();
  }

  clear() {
    this._dynamicGeometryDataManager2D.clear();
  }
}
