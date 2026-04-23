import { IHardwareRenderer } from "@galacean/engine-design";
import { Color } from "@galacean/engine-math";
import { RenderStateElementMap } from "../../BasicResources";
import { GLCapabilityType } from "../../base/Constant";
import { deepClone } from "../../clone/CloneManager";
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
  _applyShaderDataValue(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    constantPropertyMask: number,
    materialBlendState: BlendState
  ): void {
    const target = this.targetBlendState;
    const materialTarget = materialBlendState.targetBlendState;

    // BlendStateEnabled0
    {
      const key = RenderStateElementKey.BlendStateEnabled0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.enabled = v !== undefined ? !!v : materialTarget.enabled;
      }
    }

    // BlendStateColorBlendOperation0
    {
      const key = RenderStateElementKey.BlendStateColorBlendOperation0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.colorBlendOperation = v !== undefined ? v : materialTarget.colorBlendOperation;
      }
    }

    // BlendStateAlphaBlendOperation0
    {
      const key = RenderStateElementKey.BlendStateAlphaBlendOperation0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.alphaBlendOperation = v !== undefined ? v : materialTarget.alphaBlendOperation;
      }
    }

    // BlendStateSourceColorBlendFactor0
    {
      const key = RenderStateElementKey.BlendStateSourceColorBlendFactor0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.sourceColorBlendFactor = v !== undefined ? v : materialTarget.sourceColorBlendFactor;
      }
    }

    // BlendStateSourceAlphaBlendFactor0
    {
      const key = RenderStateElementKey.BlendStateSourceAlphaBlendFactor0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.sourceAlphaBlendFactor = v !== undefined ? v : materialTarget.sourceAlphaBlendFactor;
      }
    }

    // BlendStateDestinationColorBlendFactor0
    {
      const key = RenderStateElementKey.BlendStateDestinationColorBlendFactor0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.destinationColorBlendFactor = v !== undefined ? v : materialTarget.destinationColorBlendFactor;
      }
    }

    // BlendStateDestinationAlphaBlendFactor0
    {
      const key = RenderStateElementKey.BlendStateDestinationAlphaBlendFactor0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.destinationAlphaBlendFactor = v !== undefined ? v : materialTarget.destinationAlphaBlendFactor;
      }
    }

    // BlendStateColorWriteMask0
    {
      const key = RenderStateElementKey.BlendStateColorWriteMask0;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        target.colorWriteMask = v !== undefined ? v : materialTarget.colorWriteMask;
      }
    }

    // BlendStateBlendColor
    {
      const key = RenderStateElementKey.BlendStateBlendColor;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        if (prop) {
          const v = shaderData.getColor(prop);
          if (v !== undefined) {
            this.blendColor.copyFrom(v);
          } else {
            this.blendColor.copyFrom(materialBlendState.blendColor);
          }
        } else {
          this.blendColor.copyFrom(materialBlendState.blendColor);
        }
      }
    }

    // BlendStateAlphaToCoverage
    {
      const key = RenderStateElementKey.BlendStateAlphaToCoverage;
      if (!((constantPropertyMask >> key) & 1)) {
        const prop = renderStateDataMap[key];
        const v = prop ? shaderData.getFloat(prop) : undefined;
        this.alphaToCoverage = v !== undefined ? !!v : materialBlendState.alphaToCoverage;
      }
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
