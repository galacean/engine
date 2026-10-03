import { Color } from "@galacean/engine-math";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "../sprite";

/**
 * Interface for sprite renderer.
 */
export interface ISpriteRenderer {
  sprite: Sprite;
  color?: Color;
  tileMode?: SpriteTileMode;
  tiledAdaptiveThreshold?: number;
  /** @internal */
  _subChunk: SubPrimitiveChunk;
  /**
   * @internal
   */
  _getChunkManager(): PrimitiveChunkManager;
}
