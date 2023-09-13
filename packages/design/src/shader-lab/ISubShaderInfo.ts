import { IShaderPassInfo } from "./IShaderPassInfo";

export interface ISubShaderInfo {
  name: string;
  passes: (IShaderPassInfo | string)[];
  tags?: Record<string, number | string | boolean>;
}
