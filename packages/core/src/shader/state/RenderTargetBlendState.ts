import { property } from "../../clone/CloneManager";
import { BlendOperation } from "../enums/BlendOperation";
import { BlendFactor } from "../enums/BlendFactor";
import { ColorWriteMask } from "../enums/ColorWriteMask";

/**
 * The blend state of the render target.
 */
export class RenderTargetBlendState {
  /** Whether to enable blend. */
  @property
  enabled: boolean = false;
  /** color (RGB) blend operation. */
  @property
  colorBlendOperation: BlendOperation = BlendOperation.Add;
  /** alpha (A) blend operation. */
  @property
  alphaBlendOperation: BlendOperation = BlendOperation.Add;
  /** color blend factor (RGB) for source. */
  @property
  sourceColorBlendFactor: BlendFactor = BlendFactor.One;
  /** alpha blend factor (A) for source. */
  @property
  sourceAlphaBlendFactor: BlendFactor = BlendFactor.One;
  /** color blend factor (RGB) for destination. */
  @property
  destinationColorBlendFactor: BlendFactor = BlendFactor.Zero;
  /** alpha blend factor (A) for destination. */
  @property
  destinationAlphaBlendFactor: BlendFactor = BlendFactor.Zero;
  /** color mask. */
  @property
  colorWriteMask: ColorWriteMask = ColorWriteMask.All;
}
