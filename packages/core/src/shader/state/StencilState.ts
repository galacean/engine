import { IHardwareRenderer } from "@galacean/engine-design";
import { RenderStateElementMap } from "../../BasicResources";
import { defaultCloneMode } from "../../clone/CloneManager";
import { CloneMode } from "../../clone/enums/CloneMode";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { CompareFunction } from "../enums/CompareFunction";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { StencilOperation } from "../enums/StencilOperation";
import { RenderState } from "./RenderState";

/**
 * Stencil state.
 */
@defaultCloneMode(CloneMode.Deep)
export class StencilState {
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

  private static _getGLStencilOperation(rhi: IHardwareRenderer, compareFunction: StencilOperation): number {
    const gl = rhi.gl;

    switch (compareFunction) {
      case StencilOperation.Keep:
        return gl.KEEP;
      case StencilOperation.Zero:
        return gl.ZERO;
      case StencilOperation.Replace:
        return gl.REPLACE;
      case StencilOperation.IncrementSaturate:
        return gl.INCR;
      case StencilOperation.DecrementSaturate:
        return gl.DECR;
      case StencilOperation.Invert:
        return gl.INVERT;
      case StencilOperation.IncrementWrap:
        return gl.INCR_WRAP;
      case StencilOperation.DecrementWrap:
        return gl.DECR_WRAP;
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
  _applyShaderDataValue(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const enabledProp = renderStateDataMap[RenderStateElementKey.StencilStateEnabled];
    if (enabledProp !== undefined) {
      const enabled = shaderData.getFloat(enabledProp);
      this.enabled = enabled !== undefined ? !!enabled : false;
    }
    const referenceValueProp = renderStateDataMap[RenderStateElementKey.StencilStateReferenceValue];
    if (referenceValueProp !== undefined) {
      this.referenceValue = shaderData.getFloat(referenceValueProp) ?? 0;
    }
    const maskProp = renderStateDataMap[RenderStateElementKey.StencilStateMask];
    if (maskProp !== undefined) {
      this.mask = shaderData.getFloat(maskProp) ?? 0xff;
    }
    const writeMaskProp = renderStateDataMap[RenderStateElementKey.StencilStateWriteMask];
    if (writeMaskProp !== undefined) {
      this.writeMask = shaderData.getFloat(writeMaskProp) ?? 0xff;
    }
    const compareFunctionFrontProp = renderStateDataMap[RenderStateElementKey.StencilStateCompareFunctionFront];
    if (compareFunctionFrontProp !== undefined) {
      this.compareFunctionFront = shaderData.getFloat(compareFunctionFrontProp) ?? CompareFunction.Always;
    }
    const compareFunctionBackProp = renderStateDataMap[RenderStateElementKey.StencilStateCompareFunctionBack];
    if (compareFunctionBackProp !== undefined) {
      this.compareFunctionBack = shaderData.getFloat(compareFunctionBackProp) ?? CompareFunction.Always;
    }
    const passOperationFrontProp = renderStateDataMap[RenderStateElementKey.StencilStatePassOperationFront];
    if (passOperationFrontProp !== undefined) {
      this.passOperationFront = shaderData.getFloat(passOperationFrontProp) ?? StencilOperation.Keep;
    }
    const passOperationBackProp = renderStateDataMap[RenderStateElementKey.StencilStatePassOperationBack];
    if (passOperationBackProp !== undefined) {
      this.passOperationBack = shaderData.getFloat(passOperationBackProp) ?? StencilOperation.Keep;
    }
    const failOperationFrontProp = renderStateDataMap[RenderStateElementKey.StencilStateFailOperationFront];
    if (failOperationFrontProp !== undefined) {
      this.failOperationFront = shaderData.getFloat(failOperationFrontProp) ?? StencilOperation.Keep;
    }
    const failOperationBackProp = renderStateDataMap[RenderStateElementKey.StencilStateFailOperationBack];
    if (failOperationBackProp !== undefined) {
      this.failOperationBack = shaderData.getFloat(failOperationBackProp) ?? StencilOperation.Keep;
    }
    const zFailOperationFrontProp = renderStateDataMap[RenderStateElementKey.StencilStateZFailOperationFront];
    if (zFailOperationFrontProp !== undefined) {
      this.zFailOperationFront = shaderData.getFloat(zFailOperationFrontProp) ?? StencilOperation.Keep;
    }
    const zFailOperationBackProp = renderStateDataMap[RenderStateElementKey.StencilStateZFailOperationBack];
    if (zFailOperationBackProp !== undefined) {
      this.zFailOperationBack = shaderData.getFloat(zFailOperationBackProp) ?? StencilOperation.Keep;
    }
  }

  /**
   * @internal
   */
  _apply(
    hardwareRenderer: IHardwareRenderer,
    lastRenderState: RenderState,
    customStates?: RenderStateElementMap
  ): void {
    this._platformApply(hardwareRenderer, lastRenderState.stencilState, customStates);
  }

  private _platformApply(rhi: IHardwareRenderer, lastState: StencilState, customStates?: RenderStateElementMap): void {
    const gl = <WebGLRenderingContext>rhi.gl;
    let {
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

    if (customStates) {
      const enabledState = customStates[RenderStateElementKey.StencilStateEnabled];
      enabledState !== undefined && (enabled = <boolean>enabledState);
      const writeMaskState = customStates[RenderStateElementKey.StencilStateWriteMask];
      writeMaskState !== undefined && (writeMask = <number>writeMaskState);
      const referenceValueState = customStates[RenderStateElementKey.StencilStateReferenceValue];
      referenceValueState !== undefined && (referenceValue = <number>referenceValueState);
      const compareFunctionFrontState = customStates[RenderStateElementKey.StencilStateCompareFunctionFront];
      compareFunctionFrontState !== undefined && (compareFunctionFront = <CompareFunction>compareFunctionFrontState);
      const compareFunctionBackState = customStates[RenderStateElementKey.StencilStateCompareFunctionBack];
      compareFunctionBackState !== undefined && (compareFunctionBack = <CompareFunction>compareFunctionBackState);
      const passOperationFrontState = customStates[RenderStateElementKey.StencilStatePassOperationFront];
      passOperationFrontState !== undefined && (passOperationFront = <StencilOperation>passOperationFrontState);
      const passOperationBackState = customStates[RenderStateElementKey.StencilStatePassOperationBack];
      passOperationBackState !== undefined && (passOperationBack = <StencilOperation>passOperationBackState);
      const failOperationFrontState = customStates[RenderStateElementKey.StencilStateFailOperationFront];
      failOperationFrontState !== undefined && (failOperationFront = <StencilOperation>failOperationFrontState);
      const failOperationBackState = customStates[RenderStateElementKey.StencilStateFailOperationBack];
      failOperationBackState !== undefined && (failOperationBack = <StencilOperation>failOperationBackState);
      const zFailOperationFrontState = customStates[RenderStateElementKey.StencilStateZFailOperationFront];
      zFailOperationFrontState !== undefined && (zFailOperationFront = <StencilOperation>zFailOperationFrontState);
      const zFailOperationBackState = customStates[RenderStateElementKey.StencilStateZFailOperationBack];
      zFailOperationBackState !== undefined && (zFailOperationBack = <StencilOperation>zFailOperationBackState);
    }

    if (enabled != lastState.enabled) {
      if (enabled) {
        gl.enable(gl.STENCIL_TEST);
      } else {
        gl.disable(gl.STENCIL_TEST);
      }
      lastState.enabled = enabled;
    }

    if (enabled) {
      // apply stencil func.
      const referenceOrMaskChange = referenceValue !== lastState.referenceValue || mask !== lastState.mask;
      if (referenceOrMaskChange || compareFunctionFront !== lastState.compareFunctionFront) {
        gl.stencilFuncSeparate(
          gl.FRONT,
          StencilState._getGLCompareFunction(rhi, compareFunctionFront),
          referenceValue,
          mask
        );
        lastState.compareFunctionFront = compareFunctionFront;
      }

      if (referenceOrMaskChange || compareFunctionBack !== lastState.compareFunctionBack) {
        gl.stencilFuncSeparate(
          gl.BACK,
          StencilState._getGLCompareFunction(rhi, compareFunctionBack),
          referenceValue,
          mask
        );
        lastState.compareFunctionBack = compareFunctionBack;
      }
      if (referenceOrMaskChange) {
        lastState.referenceValue = referenceValue;
        lastState.mask = mask;
      }

      // apply stencil operation.
      if (
        failOperationFront !== lastState.failOperationFront ||
        zFailOperationFront !== lastState.zFailOperationFront ||
        passOperationFront !== lastState.passOperationFront
      ) {
        gl.stencilOpSeparate(
          gl.FRONT,
          StencilState._getGLStencilOperation(rhi, failOperationFront),
          StencilState._getGLStencilOperation(rhi, zFailOperationFront),
          StencilState._getGLStencilOperation(rhi, passOperationFront)
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
          StencilState._getGLStencilOperation(rhi, failOperationBack),
          StencilState._getGLStencilOperation(rhi, zFailOperationBack),
          StencilState._getGLStencilOperation(rhi, passOperationBack)
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
