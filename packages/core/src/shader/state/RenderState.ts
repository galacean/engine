import { ShaderData, ShaderProperty } from "..";
import { Engine } from "../../Engine";
import { deepClone } from "../../clone/CloneManager";
import { RenderQueueType } from "../enums/RenderQueueType";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { BlendState } from "./BlendState";
import { DepthState } from "./DepthState";
import { RasterState } from "./RasterState";
import { StencilState } from "./StencilState";

/**
 * Render state.
 */
export class RenderState {
  /** Blend state. */
  @deepClone
  readonly blendState: BlendState = new BlendState();
  /** Depth state. */
  @deepClone
  readonly depthState: DepthState = new DepthState();
  /** Stencil state. */
  @deepClone
  readonly stencilState: StencilState = new StencilState();
  /** Raster state. */
  @deepClone
  readonly rasterState: RasterState = new RasterState();

  /** Render queue type. */
  renderQueueType: RenderQueueType = RenderQueueType.Opaque;

  /**
   * @internal
   */
  _applyStates(
    engine: Engine,
    frontFaceInvert: boolean,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData
  ): void {
    // @todo: Should merge when we can delete material render state
    renderStateDataMap && this._applyStatesByShaderData(renderStateDataMap, shaderData);
    const hardwareRenderer = engine._hardwareRenderer;
    const lastRenderState = engine._lastRenderState;
    const context = engine._renderContext;
    this.blendState._apply(hardwareRenderer, lastRenderState);
    this.depthState._apply(hardwareRenderer, lastRenderState);
    this.stencilState._apply(hardwareRenderer, lastRenderState);
    this.rasterState._apply(
      hardwareRenderer,
      lastRenderState,
      context.flipProjection ? !frontFaceInvert : frontFaceInvert
    );
  }

  /**
   * @internal
   * @todo Should merge when we can delete material render state
   */
  _applyRenderQueueByShaderData(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const renderQueueType = renderStateDataMap[RenderStateElementKey.RenderQueueType];
    if (renderQueueType !== undefined) {
      this.renderQueueType = shaderData.getFloat(renderQueueType) ?? RenderQueueType.Opaque;
    }
  }

  private _applyStatesByShaderData(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    this.blendState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.depthState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.stencilState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.rasterState._applyShaderDataValue(renderStateDataMap, shaderData);
  }
}
