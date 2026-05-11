import { IRenderStates } from "./IRenderStates";
import { IShaderPassSource } from "./IShaderPassSource";
import { IStatement } from "./IStatement";

export interface ISubShaderSource {
  name: string;
  passes: IShaderPassSource[];
  pendingContents: IStatement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
}
