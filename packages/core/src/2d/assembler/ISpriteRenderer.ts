import { Color } from "@galacean/engine-math";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SpriteFilledMode } from "../enums/SpriteFilledMode";
import { SpriteFilledOrigin } from "../enums/SpriteFilledOrigin";
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
  filledMode?: SpriteFilledMode;
  filledAmount?: number;
  filledOrigin?: SpriteFilledOrigin;
  filledClockWise?: boolean;
  _subChunk: SubPrimitiveChunk;
  _getChunkManager(): PrimitiveChunkManager;
}
