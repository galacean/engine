import type { IShaderInfo } from "@galacean/engine-design";
import { ShaderLanguage } from "@galacean/engine-core";
import type { ShaderClueIR, ShaderCoreInfo } from "@galacean/engine-shader-parser/internal";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";

/** Stateless internal facade for GLES source generation. @internal */
export class GLESBackend {
  private constructor() {}

  /**
   * Generates one GLES program with request-owned visitor state.
   * @param ir - Immutable neutral parser IR.
   * @param coreInfo - Entry and stage-interface facts derived from the same IR.
   * @param target - GLES language version to emit.
   * @returns Generated vertex and fragment source.
   * @internal
   */
  static generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo, target: ShaderLanguage): IShaderInfo {
    const visitor = target === ShaderLanguage.GLSLES100 ? new GLES100Visitor() : new GLES300Visitor();
    return visitor.generate(ir, coreInfo);
  }
}
