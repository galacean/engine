import { Renderer } from "../../Renderer";

export interface IAssembler {
  resetData(renderer: Renderer): void;
  updateData(renderer: Renderer): void;
}
