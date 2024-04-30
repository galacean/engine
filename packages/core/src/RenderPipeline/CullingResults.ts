import { Engine } from "../Engine";
import { RenderQueueType } from "../shader";
import { RenderQueue } from "./RenderQueue";
import { Batcher2D } from "./batcher/Batcher2D";
import { BatcherManager } from "./batcher/BatcherManager";

/**
 * @internal
 * Culling results.
 */
export class CullingResults {
  readonly opaqueQueue: RenderQueue;
  readonly transparentQueue: RenderQueue;
  readonly alphaTestQueue: RenderQueue;

  constructor() {
    this.opaqueQueue = new RenderQueue(RenderQueueType.Opaque);
    this.transparentQueue = new RenderQueue(RenderQueueType.Transparent);
    this.alphaTestQueue = new RenderQueue(RenderQueueType.AlphaTest);
  }

  reset(): void {
    this.opaqueQueue.clear();
    this.transparentQueue.clear();
    this.alphaTestQueue.clear();
  }

  sort(): void {
    this.opaqueQueue.sort(RenderQueue._compareForOpaque);
    this.alphaTestQueue.sort(RenderQueue._compareForOpaque);
    this.transparentQueue.sort(RenderQueue._compareForTransparent);
  }

  update2DBatch(batcher: Batcher2D): void {
    this.opaqueQueue.update2DBatch(batcher);
    this.alphaTestQueue.update2DBatch(batcher);
    this.transparentQueue.update2DBatch(batcher);
  }

  destroy(): void {
    this.opaqueQueue.destroy();
    this.transparentQueue.destroy();
    this.alphaTestQueue.destroy();
  }
}
