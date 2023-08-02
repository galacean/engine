import { IShaderInfo } from "./IShaderInfo";

/**
 * Shader lab interface.
 */
export interface IShaderLab {
  parseShader(shaderSource: string): IShaderInfo;
}
