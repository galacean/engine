import { AstNodeUtils } from "./AstNodeUtils";
import { IShaderLab } from "@galacean/engine-design";
import { ShaderLib } from "@galacean/engine";

export class ShaderLab implements IShaderLab {
  parseShader(shaderSource: string) {
    return AstNodeUtils.parseShader(shaderSource);
  }

  registerShaderFragment(fragmentName: string, fragmentSource: string) {
    if (ShaderLib[fragmentName]) {
      throw `The "${fragmentName}" shader fragment already exist`;
    }
    ShaderLib[fragmentName] = fragmentSource;
  }
}
