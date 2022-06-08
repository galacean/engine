import { Renderer } from "../../Renderer";

export interface IAssembler {
  resetData(renderer: Renderer): void;
  updateData(renderer: Renderer): void;
  updatePositions(renderer: Renderer): void;
  updateUVs(renderer: Renderer): void;
  updateColor(renderer: Renderer): void;
}
