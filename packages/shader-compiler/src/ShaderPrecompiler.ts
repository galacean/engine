import { ShaderLanguage } from "@galacean/engine-core";
import type {
  IPrecompiledComputeShader,
  IPrecompiledShader,
  IShaderSource,
  IWebGPUShaderCompiler
} from "@galacean/engine-design";
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
  generateParsedComputeKernelData,
  generateParsedShaderPassData,
  requireValidShaderSource,
  serializeRenderStates
} from "./ShaderCompilation";

/**
 * Offline-only ShaderLab to `.shaderc` compiler with deterministic validation.
 *
 * This class is intentionally excluded from the runtime compiler entry. CLI and bundler adapters import
 * it from `@galacean/engine-shader-compiler/precompile`.
 */
export class ShaderPrecompiler {
  constructor(private readonly webgpu?: IWebGPUShaderCompiler) {}
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
   * @param platformTarget - Target shader language.
   * @param sourceFile - Optional logical root location used for relative includes and attribution.
   * @returns Serializable precompiled shader.
   * @throws Error when structural parsing, pass validation, or backend generation fails.
   */
  precompile(sourceCode: string, platformTarget = ShaderLanguage.GLSLES300, sourceFile?: string): IPrecompiledShader {
    this._chunkOutputCache.clear();
    const shaderSource = requireValidShaderSource(
      ShaderSourceParser.parseStrict(sourceCode, this._sourceParserObjectPool)
    );
    if (shaderSource.kind === "compute") {
      throw new Error(
        `Shader "${shaderSource.name}" is a ComputeShader; use precompileCompute() or precompileAny() with ShaderLanguage.WGSL.`
      );
    }
    return this._precompileGraphics(shaderSource, platformTarget, sourceFile);
  }

  /**
   * Compiles complete ShaderLab `ComputeShader` source into a serializable `.shaderc` structure (WebGPU WGSL only).
   * @param sourceCode - Complete ShaderLab `ComputeShader` source.
   * @param platformTarget - Target shader language (must be `ShaderLanguage.WGSL`).
   * @param sourceFile - Optional logical root location used for relative includes and attribution.
   * @returns Serializable precompiled compute shader.
   */
  precompileCompute(
    sourceCode: string,
    platformTarget = ShaderLanguage.WGSL,
    sourceFile?: string
  ): IPrecompiledComputeShader {
    this._chunkOutputCache.clear();
    const shaderSource = requireValidShaderSource(
      ShaderSourceParser.parseStrict(sourceCode, this._sourceParserObjectPool)
    );
    if (shaderSource.kind !== "compute" || !shaderSource.computeKernels?.length) {
      throw new Error(`Expected ComputeShader source, but received "${shaderSource.name}" without compute kernels.`);
    }
    return this._precompileCompute(shaderSource, platformTarget, sourceFile);
  }

  /**
   * Compiles either a graphics `Shader` or a WebGPU `ComputeShader` into a serializable `.shaderc` structure.
   * Returns `null` when a `ComputeShader` is encountered for a non-WGSL target (e.g., GLSL ES 3.00).
   */
  precompileAny(
    sourceCode: string,
    platformTarget = ShaderLanguage.GLSLES300,
    sourceFile?: string
  ): IPrecompiledShader | IPrecompiledComputeShader | null {
    this._chunkOutputCache.clear();
    const shaderSource = requireValidShaderSource(
      ShaderSourceParser.parseStrict(sourceCode, this._sourceParserObjectPool)
    );
    if (shaderSource.kind === "compute") {
      if (platformTarget !== ShaderLanguage.WGSL) {
        return null;
      }
      return this._precompileCompute(shaderSource, platformTarget, sourceFile);
    }
    return this._precompileGraphics(shaderSource, platformTarget, sourceFile);
  }

  private _precompileCompute(
    shaderSource: IShaderSource,
    platformTarget: ShaderLanguage,
    sourceFile?: string
  ): IPrecompiledComputeShader {
    if (platformTarget !== ShaderLanguage.WGSL) {
      throw new Error(`ComputeShader "${shaderSource.name}" can only be precompiled for ShaderLanguage.WGSL.`);
    }
    return {
      kind: "compute",
      name: shaderSource.name,
      platformTarget,
      kernels: shaderSource.computeKernels!.map((kernel) => {
        const parsed = parseValidatedShaderPass(
          kernel.contents,
          this._includeMap,
          this._chunkOutputCache,
          sourceFile,
          this._parserObjectPool,
          this._validatedParser,
          kernel.contentScopeStarts
        );
        if (parsed.blockingErrors.length) {
          throw new Error(
            [
              `ComputeShader "${shaderSource.name}" kernel "${kernel.name}" precompile failed:`,
              ...parsed.blockingErrors.map(formatShaderError)
            ].join("\n")
          );
        }
        const program = generateParsedComputeKernelData(parsed, kernel.entry, kernel.workgroupSize, this.webgpu, false);
        if (!program) {
          throw new Error(
            `ComputeShader "${shaderSource.name}" kernel "${kernel.name}" precompile failed, please check the shader source code.`
          );
        }
        return {
          name: kernel.name,
          entry: kernel.entry,
          workgroupSize: program.workgroupSize,
          uniformBlocks: program.uniformBlocks,
          wgslComputeInstructions: program.wgslComputeInstructions,
          wgsl: program.wgsl
        };
      })
    };
  }

  private _precompileGraphics(
    shaderSource: IShaderSource,
    platformTarget: ShaderLanguage,
    sourceFile?: string
  ): IPrecompiledShader {
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
            coreInfo,
            this.webgpu
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
            vertexOutputNames: program.vertexOutputNames,
            uniformBlocks: program.uniformBlocks,
            uniformPlan: program.uniformPlan,
            wgsl: program.wgsl,
            vertexShaderInstructions: program.vertexShaderInstructions,
            fragmentShaderInstructions: program.fragmentShaderInstructions,
            wgslVertexInstructions: program.wgslVertexInstructions,
            wgslFragmentInstructions: program.wgslFragmentInstructions
          };
        })
      }))
    };
  }
}
