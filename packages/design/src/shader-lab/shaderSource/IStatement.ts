import { IShaderPosition } from "./IShaderPosition";

export interface IStatement {
  content: string;
  range: { start: IShaderPosition; end: IShaderPosition };
}
