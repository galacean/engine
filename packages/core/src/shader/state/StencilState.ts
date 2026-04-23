import { IHardwareRenderer } from "@galacean/engine-design";
import { RenderStateElementMap } from "../../BasicResources";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { CompareFunction } from "../enums/CompareFunction";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { StencilOperation } from "../enums/StencilOperation";
import { RenderState } from "./RenderState";

/**
 * Stencil state.
 */
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
  _applyShaderDataValue(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    constantPropertyMask: number,
    materialStencilState: StencilState
  ): void {
    // StencilStateEnabled
    {
      const key = RenderStateElementKey.StencilStateEnabled;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.enabled = v !== undefined ? !!v : materialStencilState.enabled;
      }
    }

    // StencilStateReferenceValue
    {
      const key = RenderStateElementKey.StencilStateReferenceValue;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.referenceValue = v !== undefined ? v : materialStencilState.referenceValue;
      }
    }

    // StencilStateMask
    {
      const key = RenderStateElementKey.StencilStateMask;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.mask = v !== undefined ? v : materialStencilState.mask;
      }
    }

    // StencilStateWriteMask
    {
      const key = RenderStateElementKey.StencilStateWriteMask;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.writeMask = v !== undefined ? v : materialStencilState.writeMask;
      }
    }

    // StencilStateCompareFunctionFront
    {
      const key = RenderStateElementKey.StencilStateCompareFunctionFront;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.compareFunctionFront = v !== undefined ? v : materialStencilState.compareFunctionFront;
      }
    }

    // StencilStateCompareFunctionBack
    {
      const key = RenderStateElementKey.StencilStateCompareFunctionBack;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.compareFunctionBack = v !== undefined ? v : materialStencilState.compareFunctionBack;
      }
    }

    // StencilStatePassOperationFront
    {
      const key = RenderStateElementKey.StencilStatePassOperationFront;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.passOperationFront = v !== undefined ? v : materialStencilState.passOperationFront;
      }
    }

    // StencilStatePassOperationBack
    {
      const key = RenderStateElementKey.StencilStatePassOperationBack;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.passOperationBack = v !== undefined ? v : materialStencilState.passOperationBack;
      }
    }

    // StencilStateFailOperationFront
    {
      const key = RenderStateElementKey.StencilStateFailOperationFront;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.failOperationFront = v !== undefined ? v : materialStencilState.failOperationFront;
      }
    }

    // StencilStateFailOperationBack
    {
      const key = RenderStateElementKey.StencilStateFailOperationBack;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.failOperationBack = v !== undefined ? v : materialStencilState.failOperationBack;
      }
    }

    // StencilStateZFailOperationFront
    {
      const key = RenderStateElementKey.StencilStateZFailOperationFront;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.zFailOperationFront = v !== undefined ? v : materialStencilState.zFailOperationFront;
      }
    }

    // StencilStateZFailOperationBack
    {
      const key = RenderStateElementKey.StencilStateZFailOperationBack;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.zFailOperationBack = v !== undefined ? v : materialStencilState.zFailOperationBack;
      }
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
