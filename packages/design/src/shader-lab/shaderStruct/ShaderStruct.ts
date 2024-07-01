import { RenderStates } from "./RenderStates";
import { statement } from "./Statement";
import { SubShaderStruct } from "./SubShaderStruct";

export interface ShaderStruct {
  name: string;
  subShaders: SubShaderStruct[];
  globalContents: statement[];
  renderStates: RenderStates;
}
