import type { ShaderInstruction } from "./ICondition";

/**
 * Precompiled shader data structure.
 * Represents the serializable output of ShaderLab compilation,
 * allowing runtime to skip Preprocessor + Lexer + Parser + CodeGen.
 */
export interface IPrecompiledShader {
  /** Shader name (used for registration in Shader._shaderMap). */
  name: string;
  /** ShaderLanguage enum value used during compilation. */
  platformTarget: number;
  /** Sub shaders. */
  subShaders: IPrecompiledSubShader[];
}

export interface IPrecompiledSubShader {
  name: string;
  tags?: Record<string, number | string | boolean>;
  passes: IPrecompiledPass[];
}

export interface IPrecompiledPass {
  name: string;
  isUsePass: boolean;
  tags?: Record<string, number | string | boolean>;
  /** Render states. Color values are serialized as [r, g, b, a] arrays. */
  renderStates: {
    constantMap: Record<string, number | string | boolean | number[]>;
    variableMap: Record<string, string>;
  };
  /** Flat instruction array for vertex shader. */
  vertexShaderInstructions?: ShaderInstruction[];
  /** Flat instruction array for fragment shader. */
  fragmentShaderInstructions?: ShaderInstruction[];
}
