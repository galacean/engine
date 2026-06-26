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
  /** Source range of the bound entry name token — lets the analyzer point EntryNotFound at the typo. */
  vertexEntryLocation?: { start: IShaderPosition; end: IShaderPosition };
  fragmentEntryLocation?: { start: IShaderPosition; end: IShaderPosition };
}
