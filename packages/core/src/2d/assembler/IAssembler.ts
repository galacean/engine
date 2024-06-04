import { Renderer } from "../../Renderer";

/**
 * @internal
 */
export interface IAssembler {
  resetData(renderer: Renderer, vCount?: number): void;
  updatePositions?(renderer: Renderer): void;
  updateUVs?(renderer: Renderer): void;
  updateColor?(renderer: Renderer): void;
}
