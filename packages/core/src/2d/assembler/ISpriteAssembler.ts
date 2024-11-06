import { Renderer } from "../../Renderer";

/**
 * @internal
 */
export interface ISpriteAssembler {
  resetData(renderer: Renderer, vertexCount?: number): void;
  updatePositions?(renderer: Renderer): void;
  updateUVs?(renderer: Renderer): void;
  updateColor?(renderer: Renderer): void;
}
