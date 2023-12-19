import { IHardwareRenderer } from "@galacean/engine-design";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { CompareFunction } from "../enums/CompareFunction";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { RenderState } from "./RenderState";

/**
 * Depth state.
 */
export class DepthState {
  private static _getGLCompareFunction(rhi: IHardwareRenderer, compareFunction: CompareFunction): number {
    const gl = rhi.gl;

    switch (compareFunction) {
      case CompareFunction.Never:
        return gl.NEVER;
      case CompareFunction.Less:
        return gl.LESS;
      case CompareFunction.Equal:
        return gl.EQUAL;
      case CompareFunction.LessEqual:
        return gl.LEQUAL;
      case CompareFunction.Greater:
        return gl.GREATER;
      case CompareFunction.NotEqual:
        return gl.NOTEQUAL;
      case CompareFunction.GreaterEqual:
        return gl.GEQUAL;
      case CompareFunction.Always:
        return gl.ALWAYS;
    }
  }

  /** Whether to enable the depth test. */
  enabled: boolean = true;
  /** Whether the depth value can be written.*/
  writeEnabled: boolean = true;
  /** Depth comparison function. */
  compareFunction: CompareFunction = CompareFunction.Less;

  /**
   * @internal
   */
  _applyShaderDataValue(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const enableProperty = renderStateDataMap[RenderStateElementKey.DepthStateEnabled];
    if (enableProperty !== undefined) {
      const enabled = shaderData.getFloat(enableProperty);
      this.enabled = enabled !== undefined ? !!enabled : false;
    }

    const writeEnabledProperty = renderStateDataMap[RenderStateElementKey.DepthStateWriteEnabled];
    if (writeEnabledProperty !== undefined) {
      const writeEnabled = shaderData.getFloat(writeEnabledProperty);
      this.writeEnabled = writeEnabled !== undefined ? !!writeEnabled : false;
    }

    const compareFunctionProperty = renderStateDataMap[RenderStateElementKey.DepthStateCompareFunction];
    if (compareFunctionProperty !== undefined) {
      this.compareFunction = shaderData.getFloat(compareFunctionProperty) ?? CompareFunction.Less;
    }
  }

  /**
   * @internal
   * Apply the current depth state by comparing with the last depth state.
   */
  _apply(hardwareRenderer: IHardwareRenderer, lastRenderState: RenderState): void {
    this._platformApply(hardwareRenderer, lastRenderState.depthState);
  }

  private _platformApply(rhi: IHardwareRenderer, lastState: DepthState): void {
    const gl = <WebGLRenderingContext>rhi.gl;
    const { enabled, compareFunction, writeEnabled } = this;

    if (enabled != lastState.enabled) {
      if (enabled) {
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
      lastState.enabled = enabled;
    }

    if (enabled) {
      // apply compare func.
      if (compareFunction != lastState.compareFunction) {
        gl.depthFunc(DepthState._getGLCompareFunction(rhi, compareFunction));
        lastState.compareFunction = compareFunction;
      }

      // apply write enabled.
      if (writeEnabled != lastState.writeEnabled) {
        gl.depthMask(writeEnabled);
        lastState.writeEnabled = writeEnabled;
      }
    }
  }
}
