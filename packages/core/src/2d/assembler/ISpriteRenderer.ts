import { Color } from "@galacean/engine-math";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { SubPrimitiveChunk } from "../../RenderPipeline/SubPrimitiveChunk";
import { Transform } from "../../Transform";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { Sprite } from "../sprite";

export interface ISpriteRenderer {
  sprite: Sprite;
  color?: Color;
  tileMode?: SpriteTileMode;
  tiledAdaptiveThreshold?: number;
  _transform: Transform;
  _subChunk: SubPrimitiveChunk;
  _getChunkManager(): PrimitiveChunkManager;
}
