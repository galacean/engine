import { DataObject } from "../../base/DataObject";
import { ShaderData, ShaderProperty } from "..";
import { RenderStateElementMap } from "../../BasicResources";
import { Engine } from "../../Engine";
import { RenderQueueType } from "../enums/RenderQueueType";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { ShaderDataGroup } from "../enums/ShaderDataGroup";
import { BlendState } from "./BlendState";
import { DepthState } from "./DepthState";
import { RasterState } from "./RasterState";
import { StencilState } from "./StencilState";

/**
 * Render state.
 */
export class RenderState extends DataObject {
  /** @internal Select batch data for RenderElement parameters; other state parameters use material data. */
  static _getShaderData(
    property: ShaderProperty,
    materialData: ShaderData,
    renderElementData?: ShaderData
  ): ShaderData | undefined {
    return property._group === ShaderDataGroup.RenderElement ? renderElementData : materialData;
  }

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
  _applyStates(
    engine: Engine,
    frontFaceInvert: boolean,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    customRenderStates?: RenderStateElementMap | null,
    renderElementData?: ShaderData
  ): void {
    this.blendState._applyShaderDataValue(renderStateDataMap, shaderData, renderElementData);
    this.depthState._applyShaderDataValue(renderStateDataMap, shaderData, renderElementData);
    this.stencilState._applyShaderDataValue(renderStateDataMap, shaderData, renderElementData);
    this.rasterState._applyShaderDataValue(renderStateDataMap, shaderData, renderElementData);

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
    shaderData: ShaderData,
    renderElementData?: ShaderData
  ): RenderQueueType {
    const renderQueueTypeProp = renderStateDataMap[RenderStateElementKey.RenderQueueType];
    if (renderQueueTypeProp !== undefined) {
      const renderQueueType = RenderState._getShaderData(renderQueueTypeProp, shaderData, renderElementData)?.getFloat(
        renderQueueTypeProp
      );
      if (renderQueueType !== undefined) return renderQueueType;
    }
    return this.renderQueueType;
  }
}
