import { DataObject } from "../../base/DataObject";
import { Color } from "@galacean/engine-math";
import { ShaderData } from "../ShaderData";
import { ShaderProperty } from "../ShaderProperty";
import { BlendFactor } from "../enums/BlendFactor";
import { BlendOperation } from "../enums/BlendOperation";
import { ColorWriteMask } from "../enums/ColorWriteMask";
import { ShaderDataGroup } from "../enums/ShaderDataGroup";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { RenderTargetBlendState } from "./RenderTargetBlendState";

/**
 * Blend state.
 */
export class BlendState extends DataObject {
  private static _getBlendFactor(
    property: ShaderProperty,
    materialData: ShaderData,
    renderElementData: ShaderData | undefined,
    defaultValue: BlendFactor
  ): BlendFactor {
    const value = property._groups & ShaderDataGroup.RenderElement ? renderElementData?.getFloat(property) : undefined;
    return value ?? materialData.getFloat(property) ?? defaultValue;
  }

  /** The blend state of the render target. */
  readonly targetBlendState: RenderTargetBlendState = new RenderTargetBlendState();
  /** Constant blend color. */
  readonly blendColor: Color = new Color(0, 0, 0, 0);
  /** Whether to use (Alpha-to-Coverage) technology. */
  alphaToCoverage: boolean = false;

  /**
   * @internal
   */
  _applyShaderDataValue(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    renderElementData?: ShaderData
  ): void {
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
      target.sourceColorBlendFactor = BlendState._getBlendFactor(
        sourceColorBlendFactorProp,
        shaderData,
        renderElementData,
        BlendFactor.One
      );
    }
    const sourceAlphaBlendFactorProp = renderStateDataMap[RenderStateElementKey.BlendStateSourceAlphaBlendFactor0];
    if (sourceAlphaBlendFactorProp !== undefined) {
      target.sourceAlphaBlendFactor = BlendState._getBlendFactor(
        sourceAlphaBlendFactorProp,
        shaderData,
        renderElementData,
        BlendFactor.One
      );
    }
    const destinationColorBlendFactorProp =
      renderStateDataMap[RenderStateElementKey.BlendStateDestinationColorBlendFactor0];
    if (destinationColorBlendFactorProp !== undefined) {
      target.destinationColorBlendFactor = BlendState._getBlendFactor(
        destinationColorBlendFactorProp,
        shaderData,
        renderElementData,
        BlendFactor.Zero
      );
    }
    const destinationAlphaBlendFactorProp =
      renderStateDataMap[RenderStateElementKey.BlendStateDestinationAlphaBlendFactor0];
    if (destinationAlphaBlendFactorProp !== undefined) {
      target.destinationAlphaBlendFactor = BlendState._getBlendFactor(
        destinationAlphaBlendFactorProp,
        shaderData,
        renderElementData,
        BlendFactor.Zero
      );
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
}
