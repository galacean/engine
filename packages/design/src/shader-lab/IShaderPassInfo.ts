import { IRenderStateInfo } from "./IRenderStateInfo";

export interface IShaderPassInfo {
  name: string;
  vert: string;
  frag: string;
  tags?: Record<string, number | string | boolean>;
  renderStates: Array<IRenderStateInfo>;
}
