import { RenderStates } from "./RenderStates";

export interface PassStruct {
  name: string;
  isUsePass: boolean;
  // Undefined content when referenced by `UsePass`
  tags: Record<string, number | string | boolean>;
  renderStates: RenderStates;
  /** ShaderLab code source */
  contents: string;
  vertexEntry: string;
  fragmentEntry: string;
}
