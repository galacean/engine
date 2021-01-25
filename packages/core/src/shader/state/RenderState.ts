import { Engine } from "../../Engine";
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

  /** @internal */
  _apply(engine: Engine): void {
    const hardwareRenderer = engine._hardwareRenderer;
    const lastRenderState = engine._lastRenderState;
    this.blendState._apply(hardwareRenderer, lastRenderState);
    this.depthState._apply(hardwareRenderer, lastRenderState);
    this.stencilState._apply(hardwareRenderer, lastRenderState);
    this.rasterState._apply(hardwareRenderer, lastRenderState);
  }
}
