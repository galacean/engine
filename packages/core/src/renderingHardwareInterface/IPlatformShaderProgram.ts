import type { IShaderUniformVariable, IWebGPUShaderProgram } from "@galacean/engine-design";
import type { ShaderPropertyValueType } from "../shader/ShaderData";
import type { Texture } from "../texture/Texture";
import type { Primitive, SubPrimitive } from "../graphic";
import type { RenderTarget } from "../texture/RenderTarget";
import type { RenderState } from "../shader/state/RenderState";

/** Selected stage pair and its backend-specific resource interface. */
export interface IPlatformShaderSource {
  vertexSource: string;
  fragmentSource: string;
  vertexEntryPoint?: string;
  fragmentEntryPoint?: string;
  reflection?: IWebGPUShaderProgram["reflection"];
  feedbackVaryings?: string[];
  looseUniforms?: readonly IShaderUniformVariable[];
}

export interface IPlatformUniform {
  readonly name: string;
  readonly propertyId: number;
  readonly isTexture: boolean;
  readonly textureDefault?: Texture | Texture[];
  apply(value: ShaderPropertyValueType): void;
}

export interface IPlatformShaderProgram {
  readonly id: number;
  readonly attributeLocation: Record<string, number>;
  readonly isValid: boolean;
  readonly uniforms: readonly IPlatformUniform[];
  readonly uniformBlockIds: readonly number[];
  bind(): boolean;
  bindUniformBlock(name: string, binding: number): boolean;
  prewarm?(
    primitive: Primitive,
    subPrimitive: SubPrimitive,
    target: RenderTarget | null,
    state: RenderState,
    frontFaceInvert: boolean
  ): Promise<void>;
  destroy(): void;
}
