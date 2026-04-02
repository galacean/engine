import type { ShaderInstruction } from "./ICondition";

export interface IShaderProgramSource {
  vertex: string;
  fragment: string;
  vertexShaderInstructions?: ShaderInstruction[];
  fragmentShaderInstructions?: ShaderInstruction[];
}
