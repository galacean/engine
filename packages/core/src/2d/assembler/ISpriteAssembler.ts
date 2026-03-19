import { BoundingBox, Color, Matrix } from "@galacean/engine-math";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { ISpriteLayout } from "../sprite/ISpriteLayout";
import { SpritePrimitive } from "../sprite/SpritePrimitive";

/**
 * Interface for sprite assembler.
 */
export interface ISpriteAssembler {
  resetData(primitive: SpritePrimitive, chunkManager: PrimitiveChunkManager, vertexCount?: number): void;
  updatePositions(
    primitive: SpritePrimitive,
    chunkManager: PrimitiveChunkManager,
    layout: ISpriteLayout,
    worldMatrix: Matrix,
    outBounds: BoundingBox,
    tileMode?: SpriteTileMode,
    tiledAdaptiveThreshold?: number
  ): void;
  updateUVs(primitive: SpritePrimitive): void;
  updateColor(primitive: SpritePrimitive, color: Color, alpha: number): void;
}
