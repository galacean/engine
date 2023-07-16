import { AstNodeUtils } from "./AstNodeUtils";
import { IShaderInfo, IShaderLab } from "./interface";

export class ShaderLab implements IShaderLab {
  parseShader(shaderSource: string): IShaderInfo {
    return AstNodeUtils.parseShader(shaderSource);
  }
}
