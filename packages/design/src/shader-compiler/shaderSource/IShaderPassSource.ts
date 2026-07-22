import { IRenderStates } from "./IRenderStates";
import { IShaderPosition } from "./IShaderPosition";
import { IStatement } from "./IStatement";

export interface IShaderPassSource {
  name: string;
  pendingContents: IStatement[];
  isUsePass: boolean;
  tags?: Record<string, number | string | boolean>;
  renderStates: IRenderStates;
  /** Shader source code. */
  contents: string;
  vertexEntry: string;
  fragmentEntry: string;
  /** Source range of the vertex entry-point name. */
  vertexEntryLocation?: { start: IShaderPosition; end: IShaderPosition };
  /** Source range of the fragment entry-point name. */
  fragmentEntryLocation?: { start: IShaderPosition; end: IShaderPosition };
}
