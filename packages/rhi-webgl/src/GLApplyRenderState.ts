import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  CompareFunction,
  CullMode,
  RenderStateElementKey,
  StencilOperation,
  type RenderState,
  type RenderStateElementMap
} from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "./WebGLGraphicDevice";

function _getGLBlendFactor(rhi: WebGLGraphicDevice, blendFactor: BlendFactor): number {
  const gl = rhi.gl;

  switch (blendFactor) {
    case BlendFactor.Zero:
      return gl.ZERO;
    case BlendFactor.One:
      return gl.ONE;
    case BlendFactor.SourceColor:
      return gl.SRC_COLOR;
    case BlendFactor.OneMinusSourceColor:
      return gl.ONE_MINUS_SRC_COLOR;
    case BlendFactor.DestinationColor:
      return gl.DST_COLOR;
    case BlendFactor.OneMinusDestinationColor:
      return gl.ONE_MINUS_DST_COLOR;
    case BlendFactor.SourceAlpha:
      return gl.SRC_ALPHA;
    case BlendFactor.OneMinusSourceAlpha:
      return gl.ONE_MINUS_SRC_ALPHA;
    case BlendFactor.DestinationAlpha:
      return gl.DST_ALPHA;
    case BlendFactor.OneMinusDestinationAlpha:
      return gl.ONE_MINUS_DST_ALPHA;
    case BlendFactor.SourceAlphaSaturate:
      return gl.SRC_ALPHA_SATURATE;
    case BlendFactor.BlendColor:
      return gl.CONSTANT_COLOR;
    case BlendFactor.OneMinusBlendColor:
      return gl.ONE_MINUS_CONSTANT_COLOR;
  }
}

function _getGLBlendOperation(rhi: WebGLGraphicDevice, blendOperation: BlendOperation): number {
  const gl = rhi.gl;

  switch (blendOperation) {
    case BlendOperation.Add:
      return gl.FUNC_ADD;
    case BlendOperation.Subtract:
      return gl.FUNC_SUBTRACT;
    case BlendOperation.ReverseSubtract:
      return gl.FUNC_REVERSE_SUBTRACT;
    case BlendOperation.Min:
      return gl.MIN;
    case BlendOperation.Max:
      return gl.MAX;
  }
}

function applyBlend(
  state: RenderState["blendState"],
  rhi: WebGLGraphicDevice,
  lastState: RenderState["blendState"],
  customStates?: RenderStateElementMap | null
): void {
  const gl = rhi.gl;
  const lastTargetBlendState = lastState.targetBlendState;

  let {
    enabled,
    colorBlendOperation,
    alphaBlendOperation,
    sourceColorBlendFactor,
    destinationColorBlendFactor,
    sourceAlphaBlendFactor,
    destinationAlphaBlendFactor,
    colorWriteMask
  } = state.targetBlendState;

  if (customStates) {
    const colorWriteMaskState = customStates[RenderStateElementKey.BlendStateColorWriteMask0];
    colorWriteMaskState !== undefined && (colorWriteMask = <ColorWriteMask>colorWriteMaskState);
  }

  if (enabled !== lastTargetBlendState.enabled) {
    if (enabled) {
      gl.enable(gl.BLEND);
    } else {
      gl.disable(gl.BLEND);
    }
    lastTargetBlendState.enabled = enabled;
  }

  if (enabled) {
    // apply blend factor.
    if (
      sourceColorBlendFactor !== lastTargetBlendState.sourceColorBlendFactor ||
      destinationColorBlendFactor !== lastTargetBlendState.destinationColorBlendFactor ||
      sourceAlphaBlendFactor !== lastTargetBlendState.sourceAlphaBlendFactor ||
      destinationAlphaBlendFactor !== lastTargetBlendState.destinationAlphaBlendFactor
    ) {
      gl.blendFuncSeparate(
        _getGLBlendFactor(rhi, sourceColorBlendFactor),
        _getGLBlendFactor(rhi, destinationColorBlendFactor),
        _getGLBlendFactor(rhi, sourceAlphaBlendFactor),
        _getGLBlendFactor(rhi, destinationAlphaBlendFactor)
      );
      lastTargetBlendState.sourceColorBlendFactor = sourceColorBlendFactor;
      lastTargetBlendState.destinationColorBlendFactor = destinationColorBlendFactor;
      lastTargetBlendState.sourceAlphaBlendFactor = sourceAlphaBlendFactor;
      lastTargetBlendState.destinationAlphaBlendFactor = destinationAlphaBlendFactor;
    }

    // apply blend operation.
    if (
      colorBlendOperation !== lastTargetBlendState.colorBlendOperation ||
      alphaBlendOperation !== lastTargetBlendState.alphaBlendOperation
    ) {
      gl.blendEquationSeparate(
        _getGLBlendOperation(rhi, colorBlendOperation),
        _getGLBlendOperation(rhi, alphaBlendOperation)
      );
      lastTargetBlendState.colorBlendOperation = colorBlendOperation;
      lastTargetBlendState.alphaBlendOperation = alphaBlendOperation;
    }

    // apply blend color.
    const blendColor = state.blendColor;
    if (!Color.equals(lastState.blendColor, blendColor)) {
      gl.blendColor(blendColor.r, blendColor.g, blendColor.b, blendColor.a);
      lastState.blendColor.copyFrom(blendColor);
    }
  }

  // apply color mask.
  if (colorWriteMask !== lastTargetBlendState.colorWriteMask) {
    gl.colorMask(
      (colorWriteMask & ColorWriteMask.Red) !== 0,
      (colorWriteMask & ColorWriteMask.Green) !== 0,
      (colorWriteMask & ColorWriteMask.Blue) !== 0,
      (colorWriteMask & ColorWriteMask.Alpha) !== 0
    );
    lastTargetBlendState.colorWriteMask = colorWriteMask;
  }

  // apply alpha to coverage.
  const alphaToCoverage = state.alphaToCoverage;
  if (alphaToCoverage !== lastState.alphaToCoverage) {
    if (alphaToCoverage) {
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    } else {
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }
    lastState.alphaToCoverage = alphaToCoverage;
  }
}

function _getGLCompareFunction(rhi: WebGLGraphicDevice, compareFunction: CompareFunction): number {
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

function applyDepth(
  state: RenderState["depthState"],
  rhi: WebGLGraphicDevice,
  lastState: RenderState["depthState"],
  customStates?: RenderStateElementMap | null
): void {
  const gl = rhi.gl;
  let { enabled, compareFunction, writeEnabled } = state;

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
      gl.depthFunc(_getGLCompareFunction(rhi, compareFunction));
      lastState.compareFunction = compareFunction;
    }
  }

  // Apply write enabled
  if (writeEnabled != lastState.writeEnabled) {
    gl.depthMask(writeEnabled);
    lastState.writeEnabled = writeEnabled;
  }
}

function _getGLStencilOperation(rhi: WebGLGraphicDevice, compareFunction: StencilOperation): number {
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

function applyStencil(
  state: RenderState["stencilState"],
  rhi: WebGLGraphicDevice,
  lastState: RenderState["stencilState"],
  customStates?: RenderStateElementMap | null
): void {
  const gl = rhi.gl;
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
  } = state;

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
      gl.stencilFuncSeparate(gl.FRONT, _getGLCompareFunction(rhi, compareFunctionFront), referenceValue, mask);
      lastState.compareFunctionFront = compareFunctionFront;
    }

    if (referenceOrMaskChange || compareFunctionBack !== lastState.compareFunctionBack) {
      gl.stencilFuncSeparate(gl.BACK, _getGLCompareFunction(rhi, compareFunctionBack), referenceValue, mask);
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
        _getGLStencilOperation(rhi, failOperationFront),
        _getGLStencilOperation(rhi, zFailOperationFront),
        _getGLStencilOperation(rhi, passOperationFront)
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
        _getGLStencilOperation(rhi, failOperationBack),
        _getGLStencilOperation(rhi, zFailOperationBack),
        _getGLStencilOperation(rhi, passOperationBack)
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

function applyRaster(
  state: RenderState["rasterState"],
  rhi: WebGLGraphicDevice,
  lastState: RenderState["rasterState"],
  frontFaceInvert: boolean,
  customStates?: RenderStateElementMap | null
): void {
  const gl = rhi.gl;
  let { cullMode, depthBias, slopeScaledDepthBias } = state;

  if (customStates) {
    const cullModeState = customStates[RenderStateElementKey.RasterStateCullMode];
    cullModeState !== undefined && (cullMode = <CullMode>cullModeState);
  }

  const cullFaceEnable = cullMode !== CullMode.Off;
  if (cullFaceEnable !== lastState._cullFaceEnable) {
    if (cullFaceEnable) {
      gl.enable(gl.CULL_FACE);
    } else {
      gl.disable(gl.CULL_FACE);
    }
    lastState._cullFaceEnable = cullFaceEnable;
  }

  // apply front face.
  if (cullFaceEnable) {
    if (cullMode !== lastState.cullMode) {
      if (cullMode == CullMode.Back) {
        gl.cullFace(gl.BACK);
      } else {
        gl.cullFace(gl.FRONT);
      }
      lastState.cullMode = cullMode;
    }
  }

  if (frontFaceInvert !== lastState._frontFaceInvert) {
    if (frontFaceInvert) {
      gl.frontFace(gl.CW);
    } else {
      gl.frontFace(gl.CCW);
    }
    lastState._frontFaceInvert = frontFaceInvert;
  }

  // apply polygonOffset.
  if (depthBias !== lastState.depthBias || slopeScaledDepthBias !== lastState.slopeScaledDepthBias) {
    if (depthBias !== 0 || slopeScaledDepthBias !== 0) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(slopeScaledDepthBias, depthBias);
    } else {
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    lastState.depthBias = depthBias;
    lastState.slopeScaledDepthBias = slopeScaledDepthBias;
  }
}

export function applyGLRenderState(
  rhi: WebGLGraphicDevice,
  state: RenderState,
  last: RenderState,
  invert: boolean,
  custom?: RenderStateElementMap | null
): void {
  applyBlend(state.blendState, rhi, last.blendState, custom);
  applyDepth(state.depthState, rhi, last.depthState, custom);
  applyStencil(state.stencilState, rhi, last.stencilState, custom);
  applyRaster(state.rasterState, rhi, last.rasterState, invert, custom);
}
import { Color } from "@galacean/engine-math";
