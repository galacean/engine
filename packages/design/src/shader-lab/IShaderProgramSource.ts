import type { ShaderInstruction } from "./ICondition";

export interface IShaderProgramSource {
  vertex: string;
  fragment: string;
  /** Flat instruction array for vertex shader (populated by parseShaderInstructions at build time). */
  vertexShaderInstructions?: ShaderInstruction[];
  /** Flat instruction array for fragment shader (populated by parseShaderInstructions at build time). */
  fragmentShaderInstructions?: ShaderInstruction[];
}
