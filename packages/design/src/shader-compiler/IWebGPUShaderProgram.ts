import type { ShaderInstruction } from "./ICondition";
import type { IShaderUniformBlock } from "./IShaderProgramSource";
import type { IShaderProgramSource } from "./IShaderProgramSource";

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

export interface IWebGPUShaderReflection {
  /** Resolve actual texture sampler descriptors when the independent sampler count exceeds the device limit. */
  requiresSamplerKeys?: boolean;
  /** Resolve texture identity and physical array-copy compatibility for this variant. */
  requiresTextureKeys?: boolean;
  uniformBlocks: IWebGPUShaderUniformBlock[];
  textures: IWebGPUShaderTexture[];
  vertexInputs: IWebGPUShaderAttribute[];
  vertexOutputs: IWebGPUShaderAttribute[];
  fragmentOutputs: number[];
}

/** Device-consumable program. Both modules and the layout describe exactly one variant. */
export interface IWebGPUShaderProgram {
  vertex: string;
  fragment: string;
  vertexEntryPoint: string;
  fragmentEntryPoint: string;
  reflection: IWebGPUShaderReflection;
}

export interface IWebGPUShaderOptions {
  uniformBlocks?: readonly IShaderUniformBlock[];
  instanceBindingName?: string;
  instanceByteLength?: number;
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
