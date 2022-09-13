import { Engine } from "../../Engine";
import { RenderQueueType } from "../enums/RenderQueueType";
import { BlendState } from "./BlendState";
import { DepthState } from "./DepthState";
import { RasterState } from "./RasterState";
import { StencilState } from "./StencilState";

/**
 * Render state.
 */
export class RenderState {
  /** Blend state. */
  readonly blendState: BlendState = new BlendState();
  /** Depth state. */
  readonly depthState: DepthState = new DepthState();
  /** Stencil state. */
  readonly stencilState: StencilState = new StencilState();
  /** Raster state. */
  readonly rasterState: RasterState = new RasterState();

  /** Render queue type. */
  renderQueueType: RenderQueueType = RenderQueueType.Opaque;

  /**
   * @internal
   */
  _apply(engine: Engine, frontFaceInvert: boolean): void {
    const hardwareRenderer = engine._hardwareRenderer;
    const lastRenderState = engine._lastRenderState;
    this.blendState._apply(hardwareRenderer, lastRenderState);
    this.depthState._apply(hardwareRenderer, lastRenderState);
    this.stencilState._apply(hardwareRenderer, lastRenderState);
    this.rasterState._apply(hardwareRenderer, lastRenderState, frontFaceInvert);
  }
}
