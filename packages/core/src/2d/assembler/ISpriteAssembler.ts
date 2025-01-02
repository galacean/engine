import { Matrix, Vector2 } from "@galacean/engine-math";
import { ISpriteRenderer } from "./ISpriteRenderer";

/**
 * Interface for sprite assembler.
 */
export interface ISpriteAssembler {
  resetData(renderer: ISpriteRenderer, vertexCount?: number): void;
  updatePositions(
    renderer: ISpriteRenderer,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX?: boolean,
    flipY?: boolean,
    referenceResolutionPerUnit?: number
  ): void;
  updateUVs(renderer: ISpriteRenderer): void;
  updateColor(renderer: ISpriteRenderer, alpha?: number): void;
}
