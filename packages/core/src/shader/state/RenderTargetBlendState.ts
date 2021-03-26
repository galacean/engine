import { BlendOperation } from "../enums/BlendOperation";
import { BlendFactor } from "../enums/BlendFactor";
import { ColorWriteMask } from "../enums/ColorWriteMask";

/**
 * The blend state of the render target.
 */
export class RenderTargetBlendState {
  /** Whether to enable blend. */
  enabled: boolean = false;
  /** color (RGB) blend operation. */
  colorBlendOperation: BlendOperation = BlendOperation.Add;
  /** alpha (A) blend operation. */
  alphaBlendOperation: BlendOperation = BlendOperation.Add;
  /** color blend factor (RGB) for source. */
  sourceColorBlendFactor: BlendFactor = BlendFactor.One;
  /** alpha blend factor (A) for source. */
  sourceAlphaBlendFactor: BlendFactor = BlendFactor.One;
  /** color blend factor (RGB) for destination. */
  destinationColorBlendFactor: BlendFactor = BlendFactor.Zero;
  /** alpha blend factor (A) for destination. */
  destinationAlphaBlendFactor: BlendFactor = BlendFactor.Zero;
  /** color mask. */
  colorWriteMask: ColorWriteMask = ColorWriteMask.All;
}
