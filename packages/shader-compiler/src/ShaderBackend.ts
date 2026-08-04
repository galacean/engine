import type { IShaderInfo } from "@galacean/engine-design";
import type { ShaderClueIR, ShaderCoreInfo } from "@galacean/engine-shader-parser";

/**
 * Internal boundary implemented by shader source backends.
 * @internal
 */
export interface ShaderBackend {
  /**
   * Generates target source from neutral shader facts.
   * @param ir - Neutral shader IR backed by the parsed program.
   * @param coreInfo - Entry and IO facts required by code generation.
   * @returns Generated stage source.
   */
  generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo): IShaderInfo;
}
