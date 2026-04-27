import { ShaderData, ShaderProperty } from "..";
import { RenderStateElementMap } from "../../BasicResources";
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
  /**
   * @internal
   * Resolve a single render-state property with 3-tier priority:
   * shader constant (currentValue) > shaderData value > materialValue.
   * Boolean fields are coerced via `!!` based on the type of `currentValue`.
   */
  static _resolveValue<T>(
    key: RenderStateElementKey,
    constantPropertyMask: number,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    currentValue: T,
    materialValue: T
  ): T {
    if ((constantPropertyMask >> key) & 1) return currentValue;
    const prop = renderStateDataMap[key];
    if (prop) {
      const v = shaderData.getFloat(prop);
      if (v !== undefined) return <T>(typeof currentValue === "boolean" ? !!v : v);
    }
    return materialValue;
  }

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
    constantPropertyMask: number,
    materialRenderState: RenderState,
    customRenderStates?: RenderStateElementMap
  ): void {
    this.blendState._applyShaderDataValue(
      renderStateDataMap,
      shaderData,
      constantPropertyMask,
      materialRenderState.blendState
    );
    this.depthState._applyShaderDataValue(
      renderStateDataMap,
      shaderData,
      constantPropertyMask,
      materialRenderState.depthState
    );
    this.stencilState._applyShaderDataValue(
      renderStateDataMap,
      shaderData,
      constantPropertyMask,
      materialRenderState.stencilState
    );
    this.rasterState._applyShaderDataValue(
      renderStateDataMap,
      shaderData,
      constantPropertyMask,
      materialRenderState.rasterState
    );

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
    constantPropertyMask: number,
    materialRenderQueueType: RenderQueueType
  ): RenderQueueType {
    return RenderState._resolveValue(
      RenderStateElementKey.RenderQueueType,
      constantPropertyMask,
      renderStateDataMap,
      shaderData,
      this.renderQueueType,
      materialRenderQueueType
    );
  }
}
