import { PassStruct } from "./PassStruct";
import { RenderStates } from "./RenderStates";
import { statement } from "./Statement";

export interface SubShaderStruct {
  name: string;
  passes: PassStruct[];
  globalContents: statement[];
  tags?: Record<string, number | string | boolean>;
  renderStates: RenderStates;
}
