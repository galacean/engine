/**
 * Precompiled shader data structure.
 * Represents the serializable output of ShaderLab compilation,
 * allowing runtime to skip Preprocessor + Lexer + Parser + CodeGen.
 */
export interface IPrecompiledShader {
  /** Compiler version for cache invalidation. */
  version: number;
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
  /** Compiled vertex GLSL (with runtime macro conditionals preserved). Only present when isUsePass is false. */
  vertexSource?: string;
  /** Compiled fragment GLSL (with runtime macro conditionals preserved). Only present when isUsePass is false. */
  fragmentSource?: string;
  /** Whether vertex source contains runtime macro branches (#if/#ifdef/#ifndef). If false, _parseMacros can be skipped. */
  vertexHasMacros?: boolean;
  /** Whether fragment source contains runtime macro branches (#if/#ifdef/#ifndef). If false, _parseMacros can be skipped. */
  fragmentHasMacros?: boolean;
  /** Pre-parsed conditional segment tree for vertex source. Enables fast runtime macro evaluation without string scanning. */
  vertexSegments?: any[];
  /** Pre-parsed conditional segment tree for fragment source. Enables fast runtime macro evaluation without string scanning. */
  fragmentSegments?: any[];
}
