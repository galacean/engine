import { IShaderInfo, IShaderLab } from "./interface";
import { AstNodeUtils } from "./AstNodeUtils";

export class ShaderLab implements IShaderLab {
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  parseShader(shaderCode: string): IShaderInfo {
    return AstNodeUtils.parseShader(shaderCode);
  }
}
