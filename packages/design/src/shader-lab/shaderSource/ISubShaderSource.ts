import { IShaderPassSource } from "./IShaderPassSource";
import { IRenderStates } from "./IRenderStates";
import { IStatement } from "./IStatement";

export interface ISubShaderSource {
  name: string;
  passes: IShaderPassSource[];
  globalContents: IStatement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
}
