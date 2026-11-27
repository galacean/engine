import { DataObject } from "../../base/DataObject";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { CullMode } from "../enums/CullMode";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";

/**
 * Raster state.
 */
export class RasterState extends DataObject {
  /** Specifies whether or not front- and/or back-facing polygons can be culled. */
  cullMode: CullMode = CullMode.Back;
  /** The multiplier by which an implementation-specific value is multiplied with to create a constant depth offset. */
  depthBias: number = 0;
  /** The scale factor for the variable depth offset for each polygon. */
  slopeScaledDepthBias: number = 0;

  /** @internal */
  _cullFaceEnable: boolean = true;
  /** @internal */
  _frontFaceInvert: boolean = false;

  /**
   * @internal
   */
  _applyShaderDataValue(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const cullModeProp = renderStateDataMap[RenderStateElementKey.RasterStateCullMode];
    if (cullModeProp !== undefined) {
      this.cullMode = shaderData.getFloat(cullModeProp) ?? CullMode.Back;
    }
    const depthBiasProp = renderStateDataMap[RenderStateElementKey.RasterStateDepthBias];
    if (depthBiasProp !== undefined) {
      this.depthBias = shaderData.getFloat(depthBiasProp) ?? 0;
    }
    const slopeScaledDepthBiasProp = renderStateDataMap[RenderStateElementKey.RasterStateSlopeScaledDepthBias];
    if (slopeScaledDepthBiasProp !== undefined) {
      this.slopeScaledDepthBias = shaderData.getFloat(slopeScaledDepthBiasProp) ?? 0;
    }
  }
}
