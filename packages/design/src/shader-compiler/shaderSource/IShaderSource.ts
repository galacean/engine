import { IRenderStates } from "./IRenderStates";
import { IStatement } from "./IStatement";
import { ISubShaderSource } from "./ISubShaderSource";

export interface IShaderSource {
  name: string;
  pendingContents: IStatement[];
  subShaders: ISubShaderSource[];
  renderStates: IRenderStates;
}
