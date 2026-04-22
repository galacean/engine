import { ShaderData, ShaderProperty } from "..";
import { RenderStateElementMap } from "../../BasicResources";
import { Engine } from "../../Engine";
import { deepClone } from "../../clone/CloneManager";
import { RenderQueueType } from "../enums/RenderQueueType";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { RenderStateGroupFlag } from "../enums/RenderStateGroupFlag";
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
    shaderData: ShaderData,
    customRenderStates?: RenderStateElementMap
  ): void {
    // @todo: Should merge when we can delete material render state
    renderStateDataMap && this._applyStatesByShaderData(renderStateDataMap, shaderData);
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
   * @todo Should merge when we can delete material render state
   */
  _getRenderQueueByShaderData(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData
  ): RenderQueueType {
    const renderQueueType = renderStateDataMap[RenderStateElementKey.RenderQueueType];
    if (renderQueueType === undefined) {
      return this.renderQueueType;
    } else {
      return shaderData.getFloat(renderQueueType) ?? RenderQueueType.Opaque;
    }
  }

  /**
   * @internal
   * Merge values from materialRenderState for state groups NOT managed by the shader.
   * Shader constants/variables have highest priority; Material.renderState fills the rest.
   * @param source - Material's render state
   * @param managedGroupMask - Bitmask of RenderStateGroupFlag values
   */
  _mergeUnmanagedFrom(source: RenderState, managedGroupMask: number): void {
    if (!(managedGroupMask & RenderStateGroupFlag.Blend)) this.blendState._copyFrom(source.blendState);
    if (!(managedGroupMask & RenderStateGroupFlag.Depth)) this.depthState._copyFrom(source.depthState);
    if (!(managedGroupMask & RenderStateGroupFlag.Stencil)) this.stencilState._copyFrom(source.stencilState);
    if (!(managedGroupMask & RenderStateGroupFlag.Raster)) this.rasterState._copyFrom(source.rasterState);
    if (!(managedGroupMask & RenderStateGroupFlag.RenderQueueType)) this.renderQueueType = source.renderQueueType;
  }

  private _applyStatesByShaderData(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    this.blendState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.depthState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.stencilState._applyShaderDataValue(renderStateDataMap, shaderData);
    this.rasterState._applyShaderDataValue(renderStateDataMap, shaderData);
  }
}
