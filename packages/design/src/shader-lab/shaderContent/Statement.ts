import { IShaderPosition } from "./IShaderPosition";

export interface Statement {
  content: string;
  range: { start: IShaderPosition; end: IShaderPosition };
}
