import { ShaderLanguage } from "@galacean/engine-core";
import type { IPrecompiledShader } from "@galacean/engine-design";
import {
  branchAnalysis,
  createValidatedShaderTargetParser,
  normalizeShaderIncludeMap,
  ParserObjectPool,
  parseValidatedShaderPass,
  ShaderCoreInfo,
  ShaderSourceParser,
  type ChunkOutputCache,
  type IncludeMap
} from "@galacean/engine-shader-parser/internal/analyzer";
import {
  formatShaderError,
  generateParsedShaderPassData,
  requireValidShaderSource,
  serializeRenderStates
} from "./ShaderCompilation";

/**
 * Offline-only ShaderLab to `.shaderc` compiler with deterministic validation.
 *
 * This class is intentionally excluded from the runtime compiler entry. CLI and bundler adapters import
 * it from `@galacean/engine-shader-compiler/offline`.
 */
export class ShaderPrecompiler {
  private _includeMap: IncludeMap = Object.create(null);
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();
  private readonly _sourceParserObjectPool = new ParserObjectPool();
  private readonly _parserObjectPool = new ParserObjectPool();
  private readonly _validatedParser = createValidatedShaderTargetParser(this._parserObjectPool);

  /**
   * Replaces the logical include registry used by offline compilation.
   * @param includeMap - Canonical or normalizable include keys mapped to chunk sources.
   * @throws Error when multiple keys collide after normalization.
   */
  setIncludeMap(includeMap: IncludeMap): void {
    this._includeMap = normalizeShaderIncludeMap(includeMap);
    this._chunkOutputCache.clear();
  }

  /**
   * Compiles complete ShaderLab source into a serializable `.shaderc` structure.
   * @param sourceCode - Complete ShaderLab source.
   * @param platformTarget - Target GLES language.
   * @param sourceFile - Optional logical root location used for relative includes and attribution.
   * @returns Serializable precompiled shader.
   * @throws Error when structural parsing, pass validation, or backend generation fails.
   */
  precompile(sourceCode: string, platformTarget: ShaderLanguage, sourceFile?: string): IPrecompiledShader {
    this._chunkOutputCache.clear();
    const shaderSource = requireValidShaderSource(
      ShaderSourceParser.parseStrict(sourceCode, this._sourceParserObjectPool)
    );

    return {
      name: shaderSource.name,
      platformTarget,
      subShaders: shaderSource.subShaders.map((subShader) => ({
        name: subShader.name,
        tags: subShader.tags,
        passes: subShader.passes.map((pass) => {
          if (pass.isUsePass) {
            return {
              name: pass.name,
              isUsePass: true as const,
              tags: pass.tags,
              renderStates: serializeRenderStates(pass.renderStates)
            };
          }

          const parsed = parseValidatedShaderPass(
            pass.contents,
            this._includeMap,
            this._chunkOutputCache,
            sourceFile,
            this._parserObjectPool,
            this._validatedParser,
            pass.contentScopeStarts
          );
          if (parsed.blockingErrors.length) {
            throw new Error(
              [
                `Shader pass "${shaderSource.name}.${subShader.name}.${pass.name}" precompile failed:`,
                ...parsed.blockingErrors.map(formatShaderError)
              ].join("\n")
            );
          }
          const coreInfo = parsed.ir
            ? ShaderCoreInfo.create(
                parsed.ir,
                pass.vertexEntry,
                pass.fragmentEntry,
                branchAnalysis.getDeclarationCoexistence,
                branchAnalysis.getBranchCoverage
              )
            : undefined;
          const program = generateParsedShaderPassData(
            parsed,
            pass.vertexEntry,
            pass.fragmentEntry,
            platformTarget,
            coreInfo
          );
          if (!program) {
            throw new Error(
              `Shader pass "${shaderSource.name}.${subShader.name}.${pass.name}" precompile failed, please check the shader source code.`
            );
          }
          return {
            name: pass.name,
            isUsePass: false as const,
            tags: pass.tags,
            renderStates: serializeRenderStates(pass.renderStates),
            vertexShaderInstructions: program.vertexShaderInstructions,
            fragmentShaderInstructions: program.fragmentShaderInstructions
          };
        })
      }))
    };
  }
}
