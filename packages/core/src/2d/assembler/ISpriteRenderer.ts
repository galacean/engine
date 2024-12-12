import { Color } from "@galacean/engine-math";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "../sprite";

export interface ISpriteRenderer {
  sprite: Sprite;
  color?: Color;
  tileMode?: SpriteTileMode;
  tiledAdaptiveThreshold?: number;
  _subChunk: SubPrimitiveChunk;
  _getChunkManager(): PrimitiveChunkManager;
}
