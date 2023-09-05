import { IShaderInfo } from "./IShaderInfo";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  /**
   * parsing shader source code.
   */
  parseShader(shaderSource: string): IShaderInfo;
}
