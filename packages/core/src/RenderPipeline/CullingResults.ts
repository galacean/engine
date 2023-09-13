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

  constructor(engine: Engine) {
    this.opaqueQueue = new RenderQueue(engine, RenderQueueType.Opaque);
    this.transparentQueue = new RenderQueue(engine, RenderQueueType.Transparent);
    this.alphaTestQueue = new RenderQueue(engine, RenderQueueType.AlphaTest);
  }

  reset(): void {
    this.opaqueQueue.clear();
    this.transparentQueue.clear();
    this.alphaTestQueue.clear();
  }

  sort(): void {
    this.opaqueQueue.sort(RenderQueue._compareFromNearToFar);
    this.alphaTestQueue.sort(RenderQueue._compareFromNearToFar);
    this.transparentQueue.sort(RenderQueue._compareFromFarToNear);
  }

  destroy(): void {
    this.opaqueQueue.destroy();
    this.transparentQueue.destroy();
    this.alphaTestQueue.destroy();
  }
}
