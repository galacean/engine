import { Vector2 } from "@galacean/engine-math";
import { Renderer } from "../../Renderer";

/**
 * @internal
 */
export interface ISpriteAssembler {
  resetData(renderer: Renderer, vertexCount?: number): void;
  updatePositions?(
    renderer: Renderer,
    width: number,
    height: number,
    pivot: Vector2,
    flipX?: boolean,
    flipY?: boolean
  ): void;
  updateUVs?(renderer: Renderer): void;
  updateColor?(renderer: Renderer, alpha?: number): void;
  updateAlpha?(renderer: Renderer, alpha: number): void;
}
