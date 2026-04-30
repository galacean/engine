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
   * Resolve a single render-state property (Unity-style uniform model):
   *   1. If the bit for `key` is set in `constantPropertyMask`, the
   *      property is a ShaderLab literal — return `currentValue`
   *      (which holds the literal value `_applyConstRenderStates`
   *      stamped onto the pass's RenderState).
   *   2. Otherwise, look up the variable's value on the material's
   *      shaderData. Return `0` (numeric / first enum member /
   *      `false`) when not set, mirroring the way Unity treats
   *      uninitialized uniforms.
   * `currentValue` is only used as the type witness for the boolean
   * coercion branch and as the literal source for the constant tier;
   * it is NOT used as a fallback so that cross-material mutation of
   * the shared shaderPass._renderState cannot pollute later draws.
   */
  static _resolveValue<T>(
    key: RenderStateElementKey,
    constantPropertyMask: number,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    currentValue: T
  ): T {
    if ((constantPropertyMask >> key) & 1) return currentValue;
    const prop = renderStateDataMap[key];
    const v = prop !== undefined ? shaderData.getFloat(prop) : undefined;
    if (typeof currentValue === "boolean") {
      return <T>(v !== undefined ? !!v : false);
    }
    return <T>(v !== undefined ? v : 0);
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
    customRenderStates?: RenderStateElementMap
  ): void {
    this.blendState._applyShaderDataValue(renderStateDataMap, shaderData, constantPropertyMask);
    this.depthState._applyShaderDataValue(renderStateDataMap, shaderData, constantPropertyMask);
    this.stencilState._applyShaderDataValue(renderStateDataMap, shaderData, constantPropertyMask);
    this.rasterState._applyShaderDataValue(renderStateDataMap, shaderData, constantPropertyMask);

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
    constantPropertyMask: number
  ): RenderQueueType {
    return RenderState._resolveValue(
      RenderStateElementKey.RenderQueueType,
      constantPropertyMask,
      renderStateDataMap,
      shaderData,
      this.renderQueueType
    );
  }
}
