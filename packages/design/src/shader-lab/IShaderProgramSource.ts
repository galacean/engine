import type { Instruction } from "./ICondition";

export interface IShaderProgramSource {
  vertex: string;
  fragment: string;
  /** Flat instruction array for vertex shader (populated by parseInstructions at build time). */
  vertexInstructions?: Instruction[];
  /** Flat instruction array for fragment shader (populated by parseInstructions at build time). */
  fragmentInstructions?: Instruction[];
}
