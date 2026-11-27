import type { IPlatformUniform } from "../renderingHardwareInterface";

/**
 * Shader uniform block.
 * @internal
 */
export class ShaderUniformBlock {
  readonly constUniforms: IPlatformUniform[] = [];
  readonly textureUniforms: IPlatformUniform[] = [];
}
