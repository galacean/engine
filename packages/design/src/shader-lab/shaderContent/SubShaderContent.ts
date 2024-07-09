import { PassContent } from "./PassContent";
import { RenderStates } from "./RenderStates";
import { Statement } from "./Statement";

export interface SubShaderContent {
  name: string;
  passes: PassContent[];
  globalContents: Statement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: RenderStates;
}
