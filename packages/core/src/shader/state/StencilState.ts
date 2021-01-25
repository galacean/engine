import { HardwareRenderer } from "../../HardwareRenderer";
import { CompareFunction } from "../enums/CompareFunction";
import { StencilOperation } from "../enums/StencilOperation";
import { RenderState } from "./RenderState";

/**
 * Stencil state.
 */
export class StencilState {
  private static _getGLCompareFunction(compareFunction: CompareFunction): number {
    switch (compareFunction) {
      case CompareFunction.Never:
        return WebGLRenderingContext.NEVER;
      case CompareFunction.Less:
        return WebGLRenderingContext.LESS;
      case CompareFunction.Equal:
        return WebGLRenderingContext.EQUAL;
      case CompareFunction.LessEqual:
        return WebGLRenderingContext.LEQUAL;
      case CompareFunction.Greater:
        return WebGLRenderingContext.GREATER;
      case CompareFunction.NotEqual:
        return WebGLRenderingContext.NOTEQUAL;
      case CompareFunction.GreaterEqual:
        return WebGLRenderingContext.GEQUAL;
      case CompareFunction.Always:
        return WebGLRenderingContext.ALWAYS;
    }
  }

  private static _getGLStencilOperation(compareFunction: StencilOperation): number {
    switch (compareFunction) {
      case StencilOperation.Keep:
        return WebGLRenderingContext.KEEP;
      case StencilOperation.Zero:
        return WebGLRenderingContext.ZERO;
      case StencilOperation.Replace:
        return WebGLRenderingContext.REPLACE;
      case StencilOperation.IncrementSaturate:
        return WebGLRenderingContext.INCR;
      case StencilOperation.DecrementSaturate:
        return WebGLRenderingContext.DECR;
      case StencilOperation.Invert:
        return WebGLRenderingContext.INVERT;
      case StencilOperation.IncrementWrap:
        return WebGLRenderingContext.INCR_WRAP;
      case StencilOperation.DecrementWrap:
        return WebGLRenderingContext.DECR_WRAP;
    }
  }

  /** Whether to enable stencil test. */
  enabled: boolean = false;
  /** Write the reference value of the stencil buffer. */
  referenceValue: number = 0;
  /** Specifying a bit-wise mask that is used to AND the reference value and the stored stencil value when the test is done. */
  mask: number = 0xff;
  /** Specifying a bit mask to enable or disable writing of individual bits in the stencil planes. */
  writeMask: number = 0xff;
  /** The comparison function of the reference value of the front face of the geometry and the current buffer storage value. */
  compareFunctionFront: CompareFunction = CompareFunction.Always;
  /** The comparison function of the reference value of the back of the geometry and the current buffer storage value. */
  compareFunctionBack: CompareFunction = CompareFunction.Always;
  /** specifying the function to use for front face when both the stencil test and the depth test pass. */
  passOperationFront: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for back face when both the stencil test and the depth test pass. */
  passOperationBack: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for front face when the stencil test fails. */
  failOperationFront: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for back face when the stencil test fails. */
  failOperationBack: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for front face when the stencil test passes, but the depth test fails. */
  zFailOperationFront: StencilOperation = StencilOperation.Keep;
  /** specifying the function to use for back face when the stencil test passes, but the depth test fails. */
  zFailOperationBack: StencilOperation = StencilOperation.Keep;

  /**
   * @internal
   */
  _apply(hardwareRenderer: HardwareRenderer, lastRenderState: RenderState): void {
    this._platformApply(hardwareRenderer, lastRenderState.stencilState);
  }

  private _platformApply(rhi: HardwareRenderer, lastState: StencilState): void {
    const gl = <WebGLRenderingContext>rhi.gl;
    const {
      enabled,
      referenceValue,
      mask,
      compareFunctionFront,
      compareFunctionBack,
      failOperationFront,
      zFailOperationFront,
      passOperationFront,
      failOperationBack,
      zFailOperationBack,
      passOperationBack,
      writeMask
    } = this;

    if (enabled != lastState.enabled) {
      if (enabled) {
        gl.enable(gl.STENCIL_TEST);
      } else {
        gl.disable(WebGLRenderingContext.STENCIL_TEST);
      }
      lastState.enabled = enabled;
    }

    if (enabled) {
      // apply stencil func.
      const referenceOrMaskChange = referenceValue !== lastState.referenceValue || mask !== lastState.mask;
      if (referenceOrMaskChange || compareFunctionFront !== lastState.compareFunctionFront) {
        gl.stencilFuncSeparate(
          gl.FRONT,
          StencilState._getGLCompareFunction(compareFunctionFront),
          referenceValue,
          mask
        );
        lastState.compareFunctionFront = compareFunctionFront;
      }

      if (referenceOrMaskChange || compareFunctionBack !== lastState.compareFunctionBack) {
        gl.stencilFuncSeparate(gl.BACK, StencilState._getGLCompareFunction(compareFunctionBack), referenceValue, mask);
        lastState.compareFunctionBack = this.compareFunctionBack;
      }
      if (referenceOrMaskChange) {
        lastState.referenceValue = this.referenceValue;
        lastState.mask = this.mask;
      }

      // apply stencil operation.
      if (
        failOperationFront !== lastState.failOperationFront ||
        zFailOperationFront !== lastState.zFailOperationFront ||
        passOperationFront !== lastState.passOperationFront
      ) {
        gl.stencilOpSeparate(
          gl.FRONT,
          StencilState._getGLStencilOperation(failOperationFront),
          StencilState._getGLStencilOperation(zFailOperationFront),
          StencilState._getGLStencilOperation(passOperationFront)
        );
        lastState.failOperationFront = failOperationFront;
        lastState.zFailOperationFront = zFailOperationFront;
        lastState.passOperationFront = passOperationFront;
      }

      if (
        failOperationBack !== lastState.failOperationBack ||
        zFailOperationBack !== lastState.zFailOperationBack ||
        passOperationBack !== lastState.passOperationBack
      ) {
        gl.stencilOpSeparate(
          gl.BACK,
          StencilState._getGLStencilOperation(failOperationBack),
          StencilState._getGLStencilOperation(zFailOperationBack),
          StencilState._getGLStencilOperation(passOperationBack)
        );
        lastState.failOperationBack = failOperationBack;
        lastState.zFailOperationBack = zFailOperationBack;
        lastState.passOperationBack = passOperationBack;
      }

      // apply write mask.
      if (writeMask !== lastState.writeMask) {
        gl.stencilMask(writeMask);
        lastState.writeMask = writeMask;
      }
    }
  }
}
