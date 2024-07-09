import { ShaderPassContent } from "./ShaderPassContent";
import { RenderStates } from "./RenderStates";
import { Statement } from "./Statement";

export interface SubShaderContent {
  name: string;
  passes: ShaderPassContent[];
  globalContents: Statement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: RenderStates;
}
