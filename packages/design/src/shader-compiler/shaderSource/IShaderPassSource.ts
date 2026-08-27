import { IRenderStates } from "./IRenderStates";
import { IShaderPosition } from "./IShaderPosition";
import { IStatement } from "./IStatement";

/** Parsed ShaderLab pass structure before backend generation. */
export interface IShaderPassSource {
  /** Pass name. */
  name: string;
  /** ShaderLab statements inherited by or declared on the pass. */
  pendingContents: IStatement[];
  /** Whether the pass references another pass through `UsePass`. */
  isUsePass: boolean;
  /** User-defined pass tags. */
  tags?: Record<string, number | string | boolean>;
  /** Parsed render-state constants and variables. */
  renderStates: IRenderStates;
  /** Shader source code. */
  contents: string;
  /** Start offsets of Shader, SubShader, and Pass content layers in `contents`. */
  contentScopeStarts: readonly number[];
  /** Vertex entry-point name. */
  vertexEntry: string;
  /** Fragment entry-point name. */
  fragmentEntry: string;
  /** Source range of the vertex entry-point name. */
  vertexEntryLocation?: { start: IShaderPosition; end: IShaderPosition };
  /** Source range of the fragment entry-point name. */
  fragmentEntryLocation?: { start: IShaderPosition; end: IShaderPosition };
}
