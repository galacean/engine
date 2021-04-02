import { Color } from "@oasis-engine/math";
import { IHardwareRenderer } from "../../renderingHardwareInterface/IHardwareRenderer";
import { BlendFactor } from "../enums/BlendFactor";
import { BlendOperation } from "../enums/BlendOperation";
import { ColorWriteMask } from "../enums/ColorWriteMask";
import { RenderState } from "./RenderState";
import { RenderTargetBlendState } from "./RenderTargetBlendState";

/**
 * Blend state.
 */
export class BlendState {
  private static _getGLBlendFactor(blendFactor: BlendFactor): number {
    switch (blendFactor) {
      case BlendFactor.Zero:
        return WebGLRenderingContext.ZERO;
      case BlendFactor.One:
        return WebGLRenderingContext.ONE;
      case BlendFactor.SourceColor:
        return WebGLRenderingContext.SRC_COLOR;
      case BlendFactor.OneMinusSourceColor:
        return WebGLRenderingContext.ONE_MINUS_SRC_COLOR;
      case BlendFactor.DestinationColor:
        return WebGLRenderingContext.DST_COLOR;
      case BlendFactor.OneMinusDestinationColor:
        return WebGLRenderingContext.ONE_MINUS_DST_COLOR;
      case BlendFactor.SourceAlpha:
        return WebGLRenderingContext.SRC_ALPHA;
      case BlendFactor.OneMinusSourceAlpha:
        return WebGLRenderingContext.ONE_MINUS_SRC_ALPHA;
      case BlendFactor.DestinationAlpha:
        return WebGLRenderingContext.DST_ALPHA;
      case BlendFactor.OneMinusDestinationAlpha:
        return WebGLRenderingContext.ONE_MINUS_DST_ALPHA;
      case BlendFactor.SourceAlphaSaturate:
        return WebGLRenderingContext.SRC_ALPHA_SATURATE;
      case BlendFactor.BlendColor:
        return WebGLRenderingContext.CONSTANT_COLOR;
      case BlendFactor.OneMinusBlendColor:
        return WebGLRenderingContext.ONE_MINUS_CONSTANT_COLOR;
    }
  }

  private static _getGLBlendOperation(blendOperation: BlendOperation, rhi: HardwareRenderer): number {
    const gl = rhi.gl;

    switch (blendOperation) {
      case BlendOperation.Add:
        return gl.FUNC_ADD;
      case BlendOperation.Subtract:
        return gl.FUNC_SUBTRACT;
      case BlendOperation.ReverseSubtract:
        return gl.FUNC_REVERSE_SUBTRACT;
      case BlendOperation.Min:
        if (!rhi.canIUse(GLCapabilityType.blendMinMax)) {
          throw new Error("BlendOperation.Min is not supported in this context");
        }
        return gl.MIN; // in webgl1.0 is an extension
      case BlendOperation.Max:
        if (!rhi.canIUse(GLCapabilityType.blendMinMax)) {
          throw new Error("BlendOperation.Max is not supported in this context");
        }
        return gl.MAX; // in webgl1.0 is an extension
    }
  }

  /** The blend state of the render target. */
  readonly targetBlendState: RenderTargetBlendState = new RenderTargetBlendState();
  /** Constant blend color. */
  readonly blendColor: Color = new Color(0, 0, 0, 0);
  /** Whether to use (Alpha-to-Coverage) technolog. */
  alphaToCoverage: boolean = false;

  /**
   * @internal
   * Apply the current blend state by comparing with the last blend state.
   */
  _apply(hardwareRenderer: IHardwareRenderer, lastRenderState: RenderState): void {
    this._platformApply(hardwareRenderer, lastRenderState.blendState);
  }

  private _platformApply(rhi: IHardwareRenderer, lastState: BlendState): void {
    const gl = <WebGLRenderingContext>rhi.gl;
    const lastTargetBlendState = lastState.targetBlendState;

    const {
      enabled,
      colorBlendOperation,
      alphaBlendOperation,
      sourceColorBlendFactor,
      destinationColorBlendFactor,
      sourceAlphaBlendFactor,
      destinationAlphaBlendFactor,
      colorWriteMask
    } = this.targetBlendState;

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
          BlendState._getGLBlendFactor(sourceColorBlendFactor),
          BlendState._getGLBlendFactor(destinationColorBlendFactor),
          BlendState._getGLBlendFactor(sourceAlphaBlendFactor),
          BlendState._getGLBlendFactor(destinationAlphaBlendFactor)
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
          BlendState._getGLBlendOperation(colorBlendOperation, rhi),
          BlendState._getGLBlendOperation(alphaBlendOperation, rhi)
        );
        lastTargetBlendState.colorBlendOperation = colorBlendOperation;
        lastTargetBlendState.alphaBlendOperation = alphaBlendOperation;
      }

      // apply blend color.
      const blendColor = this.blendColor;
      if (!Color.equals(lastState.blendColor, blendColor)) {
        gl.blendColor(blendColor.r, blendColor.g, blendColor.b, blendColor.a);
        blendColor.cloneTo(lastState.blendColor);
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
    const alphaToCoverage = this.alphaToCoverage;
    if (alphaToCoverage !== lastState.alphaToCoverage) {
      if (alphaToCoverage) {
        gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      } else {
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      }
      lastState.alphaToCoverage = alphaToCoverage;
    }
  }
}
