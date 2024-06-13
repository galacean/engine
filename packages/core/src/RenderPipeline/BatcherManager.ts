import { Engine } from "../Engine";
import { Renderer } from "../Renderer";
import { RenderContext } from "./RenderContext";
import { RenderData } from "./RenderData";
import { RenderElement } from "./RenderElement";
import { RenderDataUsage } from "./enums/RenderDataUsage";
import { DynamicGeometryDataManager } from "./DynamicGeometryDataManager";
import { SubRenderElement } from "./SubRenderElement";

export class BatcherManager {
  /** @internal */
  _engine: Engine;
  /** @internal */
  _dynamicGeometryDataManager2D: DynamicGeometryDataManager;
  /** @internal */
  _dynamicGeometryDataManagerMask: DynamicGeometryDataManager;

  constructor(engine: Engine) {
    this._engine = engine;
    this._dynamicGeometryDataManager2D = new DynamicGeometryDataManager(engine);
    this._dynamicGeometryDataManagerMask = new DynamicGeometryDataManager(engine, 128);
  }

  destroy() {
    this._dynamicGeometryDataManager2D.destroy();
    this._dynamicGeometryDataManager2D = null;
    this._dynamicGeometryDataManagerMask.destroy();
    this._dynamicGeometryDataManagerMask = null;
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

  batch(elements: Array<RenderElement>, batchedSubElements: Array<SubRenderElement>): void {
    const length = elements.length;
    if (length === 0) {
      return;
    }

    let preSubElement: SubRenderElement;
    let preRenderer: Renderer;
    let preUsage: RenderDataUsage;
    for (let i = 0; i < length; ++i) {
      const subElements = elements[i].data.subRenderElements;
      for (let j = 0, n = subElements.length; j < n; ++j) {
        const curSubElement = subElements[j];
        const curRenderer = curSubElement.component;

        if (preSubElement) {
          // @ts-ignore
          if (preUsage === curSubElement.data.usage && preRenderer._canBatch(preSubElement, curSubElement)) {
            // @ts-ignore
            preRenderer._batchRenderElement(preSubElement, curSubElement);
          } else {
            batchedSubElements.push(preSubElement);
            preSubElement = curSubElement;
            preRenderer = curRenderer;
            preUsage = curSubElement.data.usage;
            // @ts-ignore
            preRenderer._batchRenderElement(preSubElement);
          }
        } else {
          preSubElement = curSubElement;
          preRenderer = curRenderer;
          preUsage = curSubElement.data.usage;
          // @ts-ignore
          preRenderer._batchRenderElement(preSubElement);
        }
      }
    }
    preSubElement && batchedSubElements.push(preSubElement);
  }

  uploadBuffer() {
    this._dynamicGeometryDataManager2D.uploadBuffer();
    this._dynamicGeometryDataManagerMask.uploadBuffer();
  }

  clear() {
    this._dynamicGeometryDataManager2D.clear();
    this._dynamicGeometryDataManagerMask.clear();
  }
}
