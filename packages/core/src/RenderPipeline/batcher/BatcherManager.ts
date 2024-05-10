import { Engine } from "../../Engine";
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
    this._batcher2D.batch(elements, batchedElements);
  }

  clear() {
    this._batcher2D.clear();
  }
}
