import { IShaderPassInfo } from "./IShaderPassInfo";

export interface ISubShaderInfo {
  passes: IShaderPassInfo[];
  tags?: Record<string, number | string | boolean>;
}
