import { IRenderStates } from "./IRenderStates";

export interface IShaderPassContent {
  name: string;
  isUsePass: boolean;
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
  /** ShaderLab code source. */
  contents: string;
  vertexEntry: string;
  fragmentEntry: string;
}
