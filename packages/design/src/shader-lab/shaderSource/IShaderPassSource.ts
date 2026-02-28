import { IRenderStates } from "./IRenderStates";
import { IStatement } from "./IStatement";

export interface IShaderPassSource {
  name: string;
  pendingContents: IStatement[];
  isUsePass: boolean;
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
  /** ShaderLab code source. */
  contents: string;
  vertexEntry: string;
  fragmentEntry: string;
}
