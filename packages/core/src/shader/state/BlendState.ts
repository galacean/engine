import { Color } from "@oasis-engine/math";
import { GLCapabilityType } from "../../base/Constant";
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
  private static _getGLBlendFactor(rhi: IHardwareRenderer, blendFactor: BlendFactor): number {
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

  private static _getGLBlendOperation(rhi: IHardwareRenderer, blendOperation: BlendOperation): number {
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
  /** Whether to use (Alpha-to-Coverage) technology. */
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
          BlendState._getGLBlendFactor(rhi, sourceColorBlendFactor),
          BlendState._getGLBlendFactor(rhi, destinationColorBlendFactor),
          BlendState._getGLBlendFactor(rhi, sourceAlphaBlendFactor),
          BlendState._getGLBlendFactor(rhi, destinationAlphaBlendFactor)
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
          BlendState._getGLBlendOperation(rhi, colorBlendOperation),
          BlendState._getGLBlendOperation(rhi, alphaBlendOperation)
        );
        lastTargetBlendState.colorBlendOperation = colorBlendOperation;
        lastTargetBlendState.alphaBlendOperation = alphaBlendOperation;
      }

      // apply blend color.
      const blendColor = this.blendColor;
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
