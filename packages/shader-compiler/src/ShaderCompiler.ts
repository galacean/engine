import { Color } from "@galacean/engine-math";
import { ShaderLanguage } from "@galacean/engine-core";
import { Logger } from "@galacean/engine-core";
import type { IPrecompiledShader, IRenderStates, IShaderSource } from "@galacean/engine-design";
import type { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { ShaderClueIR, ShaderCoreInfo } from "@galacean/engine-shader-parser/internal";
import type { ASTNode } from "@galacean/engine-shader-parser/internal";
import { Lexer } from "@galacean/engine-shader-parser/internal";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";
import { ShaderTargetParser } from "@galacean/engine-shader-parser/internal";
import { Preprocessor, IncludeMap, ChunkOutputCache } from "@galacean/engine-shader-parser/internal";
import { ShaderCompilerUtils } from "@galacean/engine-shader-parser/internal";
import { ShaderSourceParser } from "@galacean/engine-shader-parser/internal";
import type { ShaderBackend } from "./ShaderBackend";

/** Compiles ShaderLab sources into GLES programs and precompiled instructions. */
export class ShaderCompiler {
  private static _parser?: ShaderTargetParser;

  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();

  /**
   * Replaces the `#include` lookup table and clears the derived chunk cache.
   * @param includeMap - Canonical include paths mapped to shader chunks.
   * @internal
   */
  _setIncludeMap(includeMap: IncludeMap): void {
    this._includeMap = includeMap;
    this._chunkOutputCache.clear();
  }

  /** @internal */
  _parseShaderSource(sourceCode: string): IShaderSource {
    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
    const { shaderSource, errors } = ShaderSourceParser.parseWithErrors(sourceCode);
    for (const error of errors) Logger.error(error.toString());

    return shaderSource;
  }

  /** @internal */
  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    basePathForIncludeKey: string
  ): IShaderProgramSource | undefined {
    const macroDefineList = {};
    const { content: noIncludeContent, errors: preprocessErrors } = Preprocessor.parseWithErrors(
      source,
      basePathForIncludeKey,
      this._includeMap,
      this._chunkOutputCache
    );
    if (preprocessErrors.length) {
      for (const error of preprocessErrors) Logger.error(error.toString());
      return undefined;
    }

    const lexer = new Lexer(noIncludeContent, macroDefineList);

    const tokens = lexer.tokenize();
    const parser = (ShaderCompiler._parser ??= ShaderTargetParser.create());

    ShaderCompilerUtils.processingPassText = noIncludeContent;

    // finally so a parse miss (early return) or a codegen throw can't leave `processingPassText`
    // pointing at this pass's text — the next compile would otherwise stamp errors with stale source.
    try {
      const program = parser.parse(tokens, macroDefineList);
      if (!program) return undefined;
      const ir = new ShaderClueIR(program, noIncludeContent);
      const coreInfo = ShaderCoreInfo.create(ir, vertexEntry, fragmentEntry);
      return this._generate(ir, coreInfo, backend);
    } catch (error) {
      Logger.error(error instanceof Error ? error.toString() : String(error));
      return undefined;
    } finally {
      ShaderCompilerUtils.processingPassText = undefined;
    }
  }

  /**
   * Generates GLSL source and shader instructions from a parsed program.
   * @param program - Parsed shader program.
   * @param vertexEntry - Vertex entry-point name.
   * @param fragmentEntry - Fragment entry-point name.
   * @param backend - Target shader language.
   * @returns Generated shader program source.
   */
  generate(
    program: ASTNode.GLShaderProgram,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage
  ): IShaderProgramSource {
    const ir = new ShaderClueIR(program, ShaderCompilerUtils.processingPassText ?? "");
    const coreInfo = ShaderCoreInfo.create(ir, vertexEntry, fragmentEntry);
    return this._generate(ir, coreInfo, backend);
  }

  private _generate(ir: ShaderClueIR, coreInfo: ShaderCoreInfo, backend: ShaderLanguage): IShaderProgramSource {
    if (!coreInfo.vertexEntry.functions.length) {
      throw new Error(`Vertex entry function '${coreInfo.vertexEntry.name}' not found.`);
    }
    if (!coreInfo.fragmentEntry.functions.length) {
      throw new Error(`Fragment entry function '${coreInfo.fragmentEntry.name}' not found.`);
    }
    const codeGen: ShaderBackend =
      backend === ShaderLanguage.GLSLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();
    const ret = codeGen.generate(ir, coreInfo);
    if (ret) {
      ret.vertexShaderInstructions = ShaderInstructionEncoder.parse(ret.vertex);
      ret.fragmentShaderInstructions = ShaderInstructionEncoder.parse(ret.fragment);
    }
    return ret;
  }

  /** @internal */
  _precompile(sourceCode: string, platformTarget: ShaderLanguage, basePathForIncludeKey: string): IPrecompiledShader {
    const shaderSource = this._parseShaderSource(sourceCode);

    const subShaders = shaderSource.subShaders.map((sub) => ({
      name: sub.name,
      tags: sub.tags,
      passes: sub.passes.map((pass) => {
        if (pass.isUsePass) {
          return {
            name: pass.name,
            isUsePass: true as const,
            tags: pass.tags,
            renderStates: this._serializeRenderStates(pass.renderStates)
          };
        }

        const programSource = this._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          platformTarget,
          basePathForIncludeKey
        );

        if (!programSource) {
          throw new Error(
            `Shader pass "${shaderSource.name}.${sub.name}.${pass.name}" precompile failed, please check the shader source code.`
          );
        }

        return {
          name: pass.name,
          isUsePass: false as const,
          tags: pass.tags,
          renderStates: this._serializeRenderStates(pass.renderStates),
          vertexShaderInstructions: programSource.vertexShaderInstructions,
          fragmentShaderInstructions: programSource.fragmentShaderInstructions
        };
      })
    }));

    return {
      name: shaderSource.name,
      platformTarget,
      subShaders
    };
  }

  private _serializeRenderStates(renderStates: IRenderStates): {
    constantMap: Record<string, number | string | boolean | number[]>;
    variableMap: Record<string, string>;
  } {
    const constantMap: Record<string, number | string | boolean | number[]> = {};
    for (const key in renderStates.constantMap) {
      const value = renderStates.constantMap[key];
      if (value instanceof Color) {
        constantMap[key] = [value.r, value.g, value.b, value.a];
      } else {
        constantMap[key] = value as number | string | boolean;
      }
    }
    return {
      constantMap,
      variableMap: renderStates.variableMap
    };
  }
}
