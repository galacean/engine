import type { ShaderInstruction } from "./ICondition";

/** Backend output before runtime macro and inherited-declaration selection. */
export interface IShaderProgramSource {
  /** Unselected vertex text for inspection; use the instruction stream to compile a variant. */
  vertex: string;
  /** Unselected fragment text for inspection; use the instruction stream to compile a variant. */
  fragment: string;
  /** Original varying field names mapped to generated stage outputs for external bindings. */
  varyingNames?: Record<string, string>;
  /** Vertex program, including declaration ownership that cannot be recovered from the text view. */
  vertexShaderInstructions?: ShaderInstruction[];
  /** Fragment program, including declaration ownership that cannot be recovered from the text view. */
  fragmentShaderInstructions?: ShaderInstruction[];
}
