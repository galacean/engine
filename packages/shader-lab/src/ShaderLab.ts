import { AstNodeUtils } from "./AstNodeUtils";
import { IShaderLab } from "@galacean/engine-design";

export class ShaderLab implements IShaderLab {
  parseShader(shaderSource: string) {
    return AstNodeUtils.parseShader(shaderSource);
  }
}
