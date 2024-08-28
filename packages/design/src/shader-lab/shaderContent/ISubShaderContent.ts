import { IShaderPassContent } from "./IShaderPassContent";
import { IRenderStates } from "./IRenderStates";
import { IStatement } from "./IStatement";

export interface ISubShaderContent {
  name: string;
  passes: IShaderPassContent[];
  globalContents: IStatement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
}
