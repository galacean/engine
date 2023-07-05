import { IShaderInfo, IShaderLab } from "./interface";
import { parseShader } from "./utils";

export class ShaderLab implements IShaderLab {
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  parseShader(shaderCode: string): IShaderInfo {
    return parseShader(shaderCode);
  }
}
