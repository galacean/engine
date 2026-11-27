import type { ShaderInstruction } from "./ICondition";
import type { IShaderUniformBlock } from "./IShaderProgramSource";
import type { IShaderProgramSource } from "./IShaderProgramSource";
import type { IShaderInstanceLayout } from "./ShaderInstancing";
import type { IShaderUniformVariant } from "./ShaderUniformVariant";

export type WebGPUShaderInputType = "float" | "sint" | "uint";

/** Concrete stage interface after macro and vertex format selection. */
export interface IWebGPUShaderAttribute {
  name: string;
  location: number;
  type: WebGPUShaderInputType;
  components: number;
}

export interface IWebGPUShaderUniformBlock {
  name: IShaderUniformBlock["name"] | "Instance";
  bindingName: string;
  physicalBinding: number;
  group: number;
  binding: number;
  visibility: number;
  byteLength: number;
  members: IShaderUniformBlock["members"];
}

export interface IWebGPUShaderTexture {
  name: string;
  /** Index in a ShaderData texture array when GLSL uses a combined sampler array. */
  arrayIndex?: number;
  /** Layer of a compatible material texture in a shared physical 2D array view. */
  arrayLayer?: number;
  /** Original mip zero and count within a physical array shared by different texture extents. */
  arrayMipOffset?: number;
  arrayMipCount?: number;
  group: number;
  textureBinding: number;
  samplerBinding?: number;
  /** Stages which sample with a sampler, excluding textureLoad/textureDimensions. */
  samplerVisibility?: number;
  visibility: number;
  sampleType: "float" | "unfilterable-float" | "sint" | "uint" | "depth";
  viewDimension: "2d" | "2d-array" | "cube" | "3d";
  samplerType?: "filtering" | "non-filtering" | "comparison";
}

export interface IWebGPUShaderStorageBuffer {
  /** ShaderLab `storage <Name> { ... }` block identifier used to bind via `ShaderData.setBuffer(name, buffer)`. */
  name: string;
  group: number;
  binding: number;
  visibility: number;
  access: "read" | "read_write";
}

export interface IWebGPUShaderStorageTexture {
  /** ShaderLab storage texture uniform name bound via `ShaderData.setTexture(name, texture)`. */
  name: string;
  group: number;
  binding: number;
  visibility: number;
  format: string;
  access: "read-only" | "write-only" | "read-write";
  viewDimension: "2d" | "2d-array" | "3d";
}

export interface IWebGPUShaderReflection {
  /** Resolve actual texture sampler descriptors when the independent sampler count exceeds the device limit. */
  requiresSamplerKeys?: boolean;
  /** Resolve texture identity and physical array-copy compatibility for this variant. */
  requiresTextureKeys?: boolean;
  uniformBlocks: IWebGPUShaderUniformBlock[];
  textures: IWebGPUShaderTexture[];
  storageBuffers?: IWebGPUShaderStorageBuffer[];
  storageTextures?: IWebGPUShaderStorageTexture[];
  vertexInputs: IWebGPUShaderAttribute[];
  vertexOutputs: IWebGPUShaderAttribute[];
  fragmentOutputs: number[];
}

export interface IWebGPUComputeReflection {
  uniformBlocks: IWebGPUShaderUniformBlock[];
  storageBuffers: IWebGPUShaderStorageBuffer[];
  textures: IWebGPUShaderTexture[];
  storageTextures: IWebGPUShaderStorageTexture[];
  workgroupSize: readonly [number, number, number];
}

/** Device-consumable compute shader program for one macro variant. */
export interface IWebGPUComputeProgram {
  compute: string;
  entryPoint: string;
  reflection: IWebGPUComputeReflection;
}

/** Pre-macro-selection compute kernel output from the single-AST WGSL compiler. */
export interface IComputeProgramSource {
  /** Unselected WGSL compute text for inspection. */
  compute: string;
  /** Workgroup dimensions `[x, y, z]`. */
  workgroupSize: readonly [number, number, number];
  /** Explicit uniform blocks declared in the compute kernel. */
  uniformBlocks?: IShaderUniformBlock[];
  /** Single-AST WGSL compute instructions for zero-parser runtime macro specialization. */
  wgslComputeInstructions?: ShaderInstruction[];
  /** Precompiled WGSL for the default (no-macro) variant when linkable without runtime macros. */
  wgsl?: IWebGPUComputeProgram;
}

export interface IWebGPUComputeOptions {
  uniformBlocks?: readonly IShaderUniformBlock[];
  workgroupSize?: readonly [number, number, number];
  resolveConstant?: (name: string) => number | undefined;
  maxUniformBlockBytes?: number;
}

/** Device-consumable program. Both modules and the layout describe exactly one variant. */
export interface IWebGPUShaderProgram {
  vertex: string;
  fragment: string;
  vertexEntryPoint: string;
  fragmentEntryPoint: string;
  reflection: IWebGPUShaderReflection;
  /** Reflected GPU instancing layout when instancing was linked for this variant. */
  instanceLayout?: IShaderInstanceLayout;
  /** True when GPU instancing exceeded the uniform buffer size limit. */
  instanceOverflow?: boolean;
}

export interface IWebGPUShaderOptions {
  uniformBlocks?: readonly IShaderUniformBlock[];
  instanceBindingName?: string;
  instanceByteLength?: number;
  /** Enable automatic GPU instancing UBO synthesis during WGSL linking. */
  enableGPUInstancing?: boolean;
  /** Optional device constant resolver for array-length expressions (e.g. `gl_Max*`). */
  resolveConstant?: (name: string) => number | undefined;
  vertexInputTypes?: Readonly<Record<string, WebGPUShaderInputType>>;
  unfilterableTextures?: ReadonlySet<string>;
  computeFeedback?: boolean;
  maxSamplersPerStage?: number;
  maxTexturesPerStage?: number;
  samplerKeys?: Readonly<Record<string, string>>;
  textureKeys?: Readonly<Record<string, string>>;
  textureArrayKeys?: Readonly<Record<string, string>>;
  textureExtents?: Readonly<Record<string, { width: number; height: number; mipCount: number; format: string }>>;
  maxUniformBlockBytes?: number;
}

export interface IWebGPUShaderCompiler {
  /** Generate raw WGSL stage strings + metadata directly from the single ShaderLab IR (zero secondary AST). */
  generateWGSL?(ir: unknown, coreInfo: unknown): IShaderProgramSource | undefined;
  /** Generate raw WGSL compute stage string + metadata directly from the single ShaderLab IR. */
  generateWGSLCompute?(
    ir: unknown,
    coreInfo: unknown,
    workgroupSize: readonly [number, number, number]
  ): IComputeProgramSource | undefined;
  /** Link a macro-evaluated single-AST WGSL compute stage into a runnable WebGPU compute program. */
  compileWebGPUComputeVariant?(computeSource: string, options?: IWebGPUComputeOptions): IWebGPUComputeProgram;
  /** Reconstruct declaration sites for an already selected historical instancing variant. */
  recoverLegacyInstancing?(
    vertex: string,
    fragment: string,
    explicitBlocks: number,
    maxBlockBytes: number
  ): IShaderUniformVariant;
  /** Expand embedded GLSL directives into instructions before evaluating a historical raw pass's active macros. */
  normalizeRawStage?(instructions: ShaderInstruction[]): ShaderInstruction[];
  compileWebGPUVariant(
    vertexSource: string,
    fragmentSource: string,
    options?: IWebGPUShaderOptions
  ): IWebGPUShaderProgram;
  compileDefaultVariant(program: IShaderProgramSource): IWebGPUShaderProgram;
}
