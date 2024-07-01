import { RenderStates } from "./RenderStates";
import { statement } from "./Statement";

export interface PassStruct {
  name: string;
  isUsePass: boolean;
  // Undefined content when referenced by `UsePass`
  tags: Record<string, number | string | boolean>;
  renderStates: RenderStates;
  contents: string;
  vertexEntry: string;
  fragmentEntry: string;
}
