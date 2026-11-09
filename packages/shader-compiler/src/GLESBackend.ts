import type { IShaderInfo } from "@galacean/engine-design";
import { Logger, ReturnableObjectPool, ShaderLanguage } from "@galacean/engine-core";
import {
  GSError,
  GLESShaderInfo,
  type ShaderClueIR,
  type ShaderCoreInfo
} from "@galacean/engine-shader-parser/internal";
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
  static generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo, target: ShaderLanguage): IShaderInfo | undefined {
    const glesInfo = new GLESShaderInfo(ir, coreInfo);
    if (glesInfo.mrtOutputIssues.length || glesInfo.invalidMrtReturnLocations.length) {
      Logger.error(
        "MRT outputs require unique non-negative locations, vec4 members, and returns through an assigned struct variable."
      );
      return undefined;
    }
    if (glesInfo.invalidVaryingReturnLocations.length) {
      Logger.error("Varying vertex entries must return a struct variable or same-type function result.");
      return undefined;
    }
    if (glesInfo.structMemberOwnerIssues.length) {
      Logger.error("A struct member reference cannot be lowered safely across runtime macro expansion.");
      return undefined;
    }

    return target === ShaderLanguage.GLSLES100
      ? GLESBackend._generateWithPool(GLESBackend._gles100VisitorPool, ir, coreInfo)
      : GLESBackend._generateWithPool(GLESBackend._gles300VisitorPool, ir, coreInfo);
  }

  private static _generateWithPool<T extends GLESVisitor>(
    pool: ReturnableObjectPool<T>,
    ir: ShaderClueIR,
    coreInfo: ShaderCoreInfo
  ): IShaderInfo | undefined {
    const visitor = pool.get();
    try {
      return visitor.generate(ir, coreInfo);
    } catch (error) {
      visitor.dispose();
      if (!(error instanceof GSError)) throw error;
      Logger.error(`${error.file ? `${error.file}: ` : ""}${error.code ? `${error.code}: ` : ""}${error.toString()}`);
      return undefined;
    } finally {
      pool.return(visitor);
    }
  }
}
