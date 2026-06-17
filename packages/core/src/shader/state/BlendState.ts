import { IHardwareRenderer } from "@galacean/engine-design";
import { Color } from "@galacean/engine-math";
import { RenderStateElementMap } from "../../BasicResources";
import { GLCapabilityType } from "../../base/Constant";
import { deepClone, defaultCloneMode } from "../../clone/CloneManager";
import { CloneMode } from "../../clone/enums/CloneMode";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { BlendFactor } from "../enums/BlendFactor";
import { BlendOperation } from "../enums/BlendOperation";
import { ColorWriteMask } from "../enums/ColorWriteMask";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { RenderState } from "./RenderState";
import { RenderTargetBlendState } from "./RenderTargetBlendState";

/**
 * Blend state.
 */
@defaultCloneMode(CloneMode.Deep)
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
  @deepClone
  readonly targetBlendState: RenderTargetBlendState = new RenderTargetBlendState();
  /** Constant blend color. */
  @deepClone
  readonly blendColor: Color = new Color(0, 0, 0, 0);
  /** Whether to use (Alpha-to-Coverage) technology. */
  alphaToCoverage: boolean = false;

  /**
   * @internal
   */
  _applyShaderDataValue(renderStateDataMap: Record<number, ShaderProperty>, shaderData: ShaderData): void {
    const target = this.targetBlendState;

    const enabledProp = renderStateDataMap[RenderStateElementKey.BlendStateEnabled0];
    if (enabledProp !== undefined) {
      const enabled = shaderData.getFloat(enabledProp);
      target.enabled = enabled !== undefined ? !!enabled : false;
    }
    const colorBlendOperationProp = renderStateDataMap[RenderStateElementKey.BlendStateColorBlendOperation0];
    if (colorBlendOperationProp !== undefined) {
      target.colorBlendOperation = shaderData.getFloat(colorBlendOperationProp) ?? BlendOperation.Add;
    }
    const alphaBlendOperationProp = renderStateDataMap[RenderStateElementKey.BlendStateAlphaBlendOperation0];
    if (alphaBlendOperationProp !== undefined) {
      target.alphaBlendOperation = shaderData.getFloat(alphaBlendOperationProp) ?? BlendOperation.Add;
    }
    const sourceColorBlendFactorProp = renderStateDataMap[RenderStateElementKey.BlendStateSourceColorBlendFactor0];
    if (sourceColorBlendFactorProp !== undefined) {
      target.sourceColorBlendFactor = shaderData.getFloat(sourceColorBlendFactorProp) ?? BlendFactor.One;
    }
    const sourceAlphaBlendFactorProp = renderStateDataMap[RenderStateElementKey.BlendStateSourceAlphaBlendFactor0];
    if (sourceAlphaBlendFactorProp !== undefined) {
      target.sourceAlphaBlendFactor = shaderData.getFloat(sourceAlphaBlendFactorProp) ?? BlendFactor.One;
    }
    const destinationColorBlendFactorProp =
      renderStateDataMap[RenderStateElementKey.BlendStateDestinationColorBlendFactor0];
    if (destinationColorBlendFactorProp !== undefined) {
      target.destinationColorBlendFactor = shaderData.getFloat(destinationColorBlendFactorProp) ?? BlendFactor.Zero;
    }
    const destinationAlphaBlendFactorProp =
      renderStateDataMap[RenderStateElementKey.BlendStateDestinationAlphaBlendFactor0];
    if (destinationAlphaBlendFactorProp !== undefined) {
      target.destinationAlphaBlendFactor = shaderData.getFloat(destinationAlphaBlendFactorProp) ?? BlendFactor.Zero;
    }
    const colorWriteMaskProp = renderStateDataMap[RenderStateElementKey.BlendStateColorWriteMask0];
    if (colorWriteMaskProp !== undefined) {
      target.colorWriteMask = shaderData.getFloat(colorWriteMaskProp) ?? ColorWriteMask.All;
    }
    const blendColorProp = renderStateDataMap[RenderStateElementKey.BlendStateBlendColor];
    if (blendColorProp !== undefined) {
      const blendColor = shaderData.getColor(blendColorProp);
      if (blendColor) {
        this.blendColor.copyFrom(blendColor);
      } else {
        this.blendColor.set(0, 0, 0, 0);
      }
    }
    const alphaToCoverageProp = renderStateDataMap[RenderStateElementKey.BlendStateAlphaToCoverage];
    if (alphaToCoverageProp !== undefined) {
      const alphaToCoverage = shaderData.getFloat(alphaToCoverageProp);
      this.alphaToCoverage = alphaToCoverage !== undefined ? !!alphaToCoverage : false;
    }
  }

  /**
   * @internal
   * Apply the current blend state by comparing with the last blend state.
   */
  _apply(
    hardwareRenderer: IHardwareRenderer,
    lastRenderState: RenderState,
    customStates?: RenderStateElementMap
  ): void {
    this._platformApply(hardwareRenderer, lastRenderState.blendState, customStates);
  }

  private _platformApply(rhi: IHardwareRenderer, lastState: BlendState, customStates?: RenderStateElementMap): void {
    const gl = <WebGLRenderingContext>rhi.gl;
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
    } = this.targetBlendState;

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
