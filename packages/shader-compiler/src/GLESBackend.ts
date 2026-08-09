import type { IShaderInfo } from "@galacean/engine-design";
import { ReturnableObjectPool, ShaderLanguage } from "@galacean/engine-core";
import type { ShaderClueIR, ShaderCoreInfo } from "@galacean/engine-shader-parser/internal";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import type { GLESVisitor } from "./codeGen/GLESVisitor";

/**
 * Static internal facade for GLES source generation.
 * @internal
 */
export class GLESBackend {
  private static readonly _gles100VisitorPool = new ReturnableObjectPool(GLES100Visitor);
  private static readonly _gles300VisitorPool = new ReturnableObjectPool(GLES300Visitor);

  private constructor() {}

  /**
   * Generates one GLES program with request-owned visitor state.
   * @param ir - Request-owned neutral parser IR consumed read-only.
   * @param coreInfo - Entry and stage-interface facts derived from the same IR.
   * @param target - GLES language version to emit.
   * @returns Generated vertex and fragment source.
   * @internal
   */
  static generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo, target: ShaderLanguage): IShaderInfo {
    return target === ShaderLanguage.GLSLES100
      ? GLESBackend._generateWithPool(GLESBackend._gles100VisitorPool, ir, coreInfo)
      : GLESBackend._generateWithPool(GLESBackend._gles300VisitorPool, ir, coreInfo);
  }

  private static _generateWithPool<T extends GLESVisitor>(
    pool: ReturnableObjectPool<T>,
    ir: ShaderClueIR,
    coreInfo: ShaderCoreInfo
  ): IShaderInfo {
    const visitor = pool.get();
    const result = visitor.generate(ir, coreInfo);
    pool.return(visitor);
    return result;
  }
}
