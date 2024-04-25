import { Engine } from "../Engine";
import { RenderQueueType } from "../shader";
import { RenderQueue } from "./RenderQueue";

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

  destroy(): void {
    this.opaqueQueue.destroy();
    this.transparentQueue.destroy();
    this.alphaTestQueue.destroy();
  }
}
