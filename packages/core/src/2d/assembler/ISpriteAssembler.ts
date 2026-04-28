import { BoundingBox, Color, Matrix, Vector2 } from "@galacean/engine-math";
import { PrimitiveChunkManager } from "../../RenderPipeline/PrimitiveChunkManager";
import { SpriteTileMode } from "../enums/SpriteTileMode";
import { SpritePrimitive } from "../sprite/SpritePrimitive";

/**
 * Interface for sprite assembler.
 */
export interface ISpriteAssembler {
  resetData(primitive: SpritePrimitive, chunkManager: PrimitiveChunkManager, vertexCount?: number): void;
  updatePositions(
    primitive: SpritePrimitive,
    chunkManager: PrimitiveChunkManager,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean,
    outBounds: BoundingBox,
    referenceResolutionPerUnit?: number,
    tileMode?: SpriteTileMode,
    tiledAdaptiveThreshold?: number
  ): void;
  updateUVs(primitive: SpritePrimitive): void;
  updateColor(primitive: SpritePrimitive, color: Color, alpha: number): void;
}
