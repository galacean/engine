import { ShaderData, ShaderProperty } from "..";
import { RenderStateElementMap } from "../../BasicResources";
import { Engine } from "../../Engine";
import { property } from "../../clone/CloneManager";
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
  @property
  readonly blendState: BlendState = new BlendState();
  /** Depth state. */
  @property
  readonly depthState: DepthState = new DepthState();
  /** Stencil state. */
  @property
  readonly stencilState: StencilState = new StencilState();
  /** Raster state. */
  @property
  readonly rasterState: RasterState = new RasterState();

  /** Render queue type. */
  @property
  renderQueueType: RenderQueueType = RenderQueueType.Opaque;

  /**
   * @internal
   */
  _applyStates(
    engine: Engine,
    frontFaceInvert: boolean,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    customRenderStates?: RenderStateElementMap
  ): void {
    this.blendState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.depthState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.stencilState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.rasterState._applyShaderDataValue(renderStateDataMap, shaderData);

    const hardwareRenderer = engine._hardwareRenderer;
    const lastRenderState = engine._lastRenderState;
    const context = engine._renderContext;
    this.blendState._apply(hardwareRenderer, lastRenderState, customRenderStates);
    this.depthState._apply(hardwareRenderer, lastRenderState, customRenderStates);
    this.stencilState._apply(hardwareRenderer, lastRenderState, customRenderStates);
    this.rasterState._apply(
      hardwareRenderer,
      lastRenderState,
      context.flipProjection ? !frontFaceInvert : frontFaceInvert,
      customRenderStates
    );
  }

  /**
   * @internal
   */
  _getRenderQueueByShaderData(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData
  ): RenderQueueType {
    const renderQueueTypeProp = renderStateDataMap[RenderStateElementKey.RenderQueueType];
    if (renderQueueTypeProp !== undefined) {
      const renderQueueType = shaderData.getFloat(renderQueueTypeProp);
      if (renderQueueType !== undefined) return renderQueueType;
    }
    return this.renderQueueType;
  }
}
