import { Color } from "@galacean/engine-math";
import { ShaderLanguage } from "@galacean/engine-core";
import type { IPrecompiledShader, IRenderStates, IShaderSource } from "@galacean/engine-design";
import type { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { Lexer } from "@galacean/engine-shader-parser";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";
import { ShaderTargetParser } from "@galacean/engine-shader-parser";
import { Preprocessor, IncludeMap, ChunkOutputCache } from "@galacean/engine-shader-parser";
import { ShaderCompilerUtils } from "@galacean/engine-shader-parser";
import { ShaderSourceParser } from "@galacean/engine-shader-parser";

export class ShaderCompiler {
  private static _parser = ShaderTargetParser.create();

  private _includeMap: IncludeMap = {};
  private readonly _chunkOutputCache: ChunkOutputCache = new Map();

  /** Replace the `#include` lookup table and clear the derived chunk cache. */
  _setIncludeMap(includeMap: IncludeMap): void {
    this._includeMap = includeMap;
    this._chunkOutputCache.clear();
  }

  _parseShaderSource(sourceCode: string): IShaderSource {
    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
    const shaderSource = ShaderSourceParser.parse(sourceCode);

    return shaderSource;
  }

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    basePathForIncludeKey: string
  ): IShaderProgramSource | undefined {
    const macroDefineList = {};
    const noIncludeContent = Preprocessor.parse(
      source,
      basePathForIncludeKey,
      this._includeMap,
      this._chunkOutputCache
    );

    const lexer = new Lexer(noIncludeContent, macroDefineList);

    const tokens = lexer.tokenize();
    const { _parser: parser } = ShaderCompiler;

    ShaderCompilerUtils.processingPassText = noIncludeContent;

    // finally so a parse miss (early return) or a codegen throw can't leave `processingPassText`
    // pointing at this pass's text — the next compile would otherwise stamp errors with stale source.
    try {
      const program = parser.parse(tokens, macroDefineList);

      if (!program) {
        return undefined;
      }

      const codeGen = backend === ShaderLanguage.GLSLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();

      const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);

      if (ret) {
        ret.vertexShaderInstructions = ShaderInstructionEncoder.parse(ret.vertex);
        ret.fragmentShaderInstructions = ShaderInstructionEncoder.parse(ret.fragment);
      }

      return ret;
    } finally {
      ShaderCompilerUtils.processingPassText = undefined;
    }
  }

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
