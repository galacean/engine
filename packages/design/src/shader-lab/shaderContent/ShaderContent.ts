import { RenderStates } from "./RenderStates";
import { Statement } from "./Statement";
import { SubShaderContent } from "./SubShaderContent";

export interface ShaderContent {
  name: string;
  subShaders: SubShaderContent[];
  globalContents: Statement[];
  renderStates: RenderStates;
}
