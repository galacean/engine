import { IRenderStates } from "./IRenderStates";
import { IStatement } from "./IStatement";
import { ISubShaderContent } from "./ISubShaderContent";

export interface IShaderContent {
  name: string;
  subShaders: ISubShaderContent[];
  globalContents: IStatement[];
  renderStates: IRenderStates;
}
