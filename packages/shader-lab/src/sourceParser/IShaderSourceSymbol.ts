import { IBaseSymbol } from "../common/IBaseSymbol";

export interface IShaderSourceSymbol extends IBaseSymbol {
  type: number;
  value?: any;
}
