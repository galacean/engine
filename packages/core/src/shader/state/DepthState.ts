import { IHardwareRenderer } from "@galacean/engine-design";
import { RenderStateElementMap } from "../../BasicResources";
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
  /** Depth comparison function. */
  compareFunction: CompareFunction = CompareFunction.Less;
  /** Whether the depth value can be written.*/
  writeEnabled: boolean = true;

  /**
   * @internal
   */
  _applyShaderDataValue(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    constantPropertyMask: number,
    materialDepthState: DepthState
  ): void {
    const args = [constantPropertyMask, renderStateDataMap, shaderData] as const;

    this.enabled = RenderState._resolveValue(
      RenderStateElementKey.DepthStateEnabled,
      ...args,
      this.enabled,
      materialDepthState.enabled
    );
    this.writeEnabled = RenderState._resolveValue(
      RenderStateElementKey.DepthStateWriteEnabled,
      ...args,
      this.writeEnabled,
      materialDepthState.writeEnabled
    );
    this.compareFunction = RenderState._resolveValue(
      RenderStateElementKey.DepthStateCompareFunction,
      ...args,
      this.compareFunction,
      materialDepthState.compareFunction
    );
  }

  /**
   * @internal
   * Apply the current depth state by comparing with the last depth state.
   */
  _apply(
    hardwareRenderer: IHardwareRenderer,
    lastRenderState: RenderState,
    customStates?: RenderStateElementMap
  ): void {
    this._platformApply(hardwareRenderer, lastRenderState.depthState, customStates);
  }

  private _platformApply(rhi: IHardwareRenderer, lastState: DepthState, customStates?: RenderStateElementMap): void {
    const gl = <WebGLRenderingContext>rhi.gl;
    let { enabled, compareFunction, writeEnabled } = this;

    if (customStates) {
      const enabledState = customStates[RenderStateElementKey.DepthStateEnabled];
      enabledState !== undefined && (enabled = <boolean>enabledState);
    }

    if (enabled != lastState.enabled) {
      if (enabled) {
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
      lastState.enabled = enabled;
    }

    if (enabled) {
      // Apply compare func
      if (compareFunction != lastState.compareFunction) {
        gl.depthFunc(DepthState._getGLCompareFunction(rhi, compareFunction));
        lastState.compareFunction = compareFunction;
      }
    }

    // Apply write enabled
    if (writeEnabled != lastState.writeEnabled) {
      gl.depthMask(writeEnabled);
      lastState.writeEnabled = writeEnabled;
    }
  }
}
