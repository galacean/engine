import { Engine } from "../../Engine";
import { RenderContext } from "../RenderContext";
import { RenderData } from "../RenderData";
import { SpriteRenderData } from "../SpriteRenderData";
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
  }

  commitRenderData(context: RenderContext, data: RenderData | Array<RenderData>): void {
    if (!data) return;

    if (data instanceof Array) {
      for (let i = 0, l = data.length; i < l; ++i) {
        this._handleRenderData(context, data[i]);
      }
    } else {
      this._handleRenderData(context, data);
    }
  }

  flush(): void {
    this._batcher2D.flush();
  }

  uploadBuffer(): void {
    this._batcher2D.uploadBuffer();
  }

  clear() {
    this._batcher2D.clear();
  }

  private _handleRenderData(context: RenderContext, data: RenderData): void {
    switch (data.usage) {
      case RenderDataUsage.Mesh:
        this._batcher2D.flush();
        context.camera._renderPipeline.pushRenderData(context, data);
        break;
      case RenderDataUsage.Sprite:
        this._batcher2D.commitRenderData(context, <SpriteRenderData>data);
        break;
    }
  }
}
