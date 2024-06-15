import { RenderQueueType } from "../shader";
import { RenderQueue } from "./RenderQueue";
import { BatcherManager } from "./BatcherManager";
import { MaskManager } from "./MaskManager";

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

  batch(batcherManager: BatcherManager) {
    this.opaqueQueue.batch(RenderQueue.compareForOpaque, batcherManager);
    this.alphaTestQueue.batch(RenderQueue.compareForOpaque, batcherManager);
    this.transparentQueue.batch(RenderQueue.compareForTransparent, batcherManager);
  }

  destroy(): void {
    this.opaqueQueue.destroy();
    this.transparentQueue.destroy();
    this.alphaTestQueue.destroy();
  }
}
