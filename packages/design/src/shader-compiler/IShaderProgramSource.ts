import type { ShaderInstruction } from "./ICondition";
import type { IShaderUniformPlan } from "./IShaderUniformPlan";
import type { IWebGPUShaderProgram } from "./IWebGPUShaderProgram";

/** Byte layout of a fixed, column-major std140 uniform block. */
export interface IShaderUniformBlock {
  name: "Scene" | "Camera" | "Auto";
  /** Backend block identifier. A distinct name protects user types, uniforms and macros. */
  bindingName?: string;
  byteLength: number;
  members: IShaderUniformBlockMember[];
}

export interface IShaderUniformBlockMember {
  name: string;
  /** ShaderLab scalar, vector or matrix type. */
  type: string;
  offset: number;
  /** Element count, or zero for a non-array. */
  arrayLength: number;
  /** Distance in bytes between consecutive elements, or zero for a non-array. */
  arrayStride: number;
  /** Distance in bytes between columns, or zero for a non-matrix. */
  matrixStride: number;
}

/** Backend output before runtime macro and inherited-declaration selection. */
export interface IShaderProgramSource {
  /** Unselected vertex text for inspection; use the instruction stream to compile a variant. */
  vertex: string;
  /** Unselected fragment text for inspection; use the instruction stream to compile a variant. */
  fragment: string;
  /** Source vertex output names mapped to their generated GLSL names. */
  vertexOutputNames?: Readonly<Record<string, string>>;
  /** Explicit uniform blocks used by either stage, before macro selection. */
  uniformBlocks?: IShaderUniformBlock[];
  uniformPlan?: IShaderUniformPlan;
  /** Precompiled WGSL for the no-feature variant; instructions retain all feature variants. */
  wgsl?: IWebGPUShaderProgram;
  /** Vertex program, including declaration ownership that cannot be recovered from the text view. */
  vertexShaderInstructions?: ShaderInstruction[];
  /** Fragment program, including declaration ownership that cannot be recovered from the text view. */
  fragmentShaderInstructions?: ShaderInstruction[];
  /** Single-AST WGSL vertex instructions for zero-parser runtime WebGPU specialization. */
  wgslVertexInstructions?: ShaderInstruction[];
  /** Single-AST WGSL fragment instructions for zero-parser runtime WebGPU specialization. */
  wgslFragmentInstructions?: ShaderInstruction[];
}
