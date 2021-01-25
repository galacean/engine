import { ShaderUniform } from "./ShaderUniform";

/**
 * Shader uniform block.
 * @internal
 */
export class ShaderUniformBlock {
  readonly constUniforms: ShaderUniform[] = [];
  readonly textureUniforms: ShaderUniform[] = [];
}
