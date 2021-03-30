import { IHardwareRenderer } from "../../renderingHardwareInterface/IHardwareRenderer";
import { CompareFunction } from "../enums/CompareFunction";
import { RenderState } from "./RenderState";

/**
 * Depth state.
 */
export class DepthState {
  private static _getGLCompareFunction(compareFunction: CompareFunction): number {
    switch (compareFunction) {
      case CompareFunction.Never:
        return WebGLRenderingContext.NEVER;
      case CompareFunction.Less:
        return WebGLRenderingContext.LESS;
      case CompareFunction.Equal:
        return WebGLRenderingContext.EQUAL;
      case CompareFunction.LessEqual:
        return WebGL2RenderingContext.LEQUAL;
      case CompareFunction.Greater:
        return WebGL2RenderingContext.GREATER;
      case CompareFunction.NotEqual:
        return WebGL2RenderingContext.NOTEQUAL;
      case CompareFunction.GreaterEqual:
        return WebGL2RenderingContext.GEQUAL;
      case CompareFunction.Always:
        return WebGL2RenderingContext.ALWAYS;
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
        gl.depthFunc(DepthState._getGLCompareFunction(compareFunction));
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
