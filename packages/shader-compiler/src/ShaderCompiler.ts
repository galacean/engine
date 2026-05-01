import { Color, Logger, ShaderLanguage } from "@galacean/engine";
import { IPrecompiledShader, IRenderStates, IShaderCompiler, IShaderSource } from "@galacean/engine-design";
import { IShaderProgramSource } from "@galacean/engine-design/types/shader-compiler/IShaderProgramSource";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { ShaderPosition, ShaderRange } from "./common";
import { Lexer } from "./lexer";
import { ShaderInstructionEncoder } from "./ShaderInstructionEncoder";
import { ShaderTargetParser } from "./parser";
import { Preprocessor, IncludeMap } from "./Preprocessor";
import { ShaderCompilerUtils } from "./ShaderCompilerUtils";
import { ShaderSourceParser } from "./sourceParser/ShaderSourceParser";

export class ShaderCompiler implements IShaderCompiler {
  private static _parser = ShaderTargetParser.create();
  private static _shaderPositionPool = ShaderCompilerUtils.createObjectPool(ShaderPosition);
  private static _shaderRangePool = ShaderCompilerUtils.createObjectPool(ShaderRange);

  // #if _VERBOSE
  static _processingPassText?: string;
  // #endif

  /**
   * `#include` lookup table. Defaults to an empty map; runtime callers (engine
   * `Shader.create` flow) bind it to `ShaderFactory.includeMap` so the runtime
   * include registry stays the source of truth. Build-time callers (the
   * bundler) bind it to a freshly-scanned src map so chunk path renames take
   * effect on the next precompile without rebuilding any package.
   *
   * Keeping the binding here (instead of having `Preprocessor` read a global)
   * means shader-compiler does not import `ShaderFactory` and stays free of
   * any engine module-load side effects.
   */
  _includeMap: IncludeMap = {};

  static createPosition(index: number, line?: number, column?: number): ShaderPosition {
    const position = this._shaderPositionPool.get();
    position.set(
      index,
      // #if _VERBOSE
      line,
      column
      // #endif
    );
    return position;
  }

  static createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const range = this._shaderRangePool.get();
    range.set(start, end);
    return range;
  }

  _parseShaderSource(sourceCode: string): IShaderSource {
    ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
    const shaderSource = ShaderSourceParser.parse(sourceCode);

    // #if _VERBOSE
    this._logErrors(ShaderSourceParser.errors);
    // #endif

    return shaderSource;
  }

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderLanguage,
    basePathForIncludeKey: string
  ): IShaderProgramSource | undefined {
    const totalStartTime = performance.now();
    const macroDefineList = {};
    Preprocessor._repeatIncludeSet.clear();
    const noIncludeContent = Preprocessor.parse(source, basePathForIncludeKey, this._includeMap);
    Logger.info(`[Task - Pre processor] cost time ${performance.now() - totalStartTime}ms`);

    const lexer = new Lexer(noIncludeContent, macroDefineList);

    const tokens = lexer.tokenize();
    const { _parser: parser } = ShaderCompiler;

    ShaderCompiler._processingPassText = noIncludeContent;

    const program = parser.parse(tokens, macroDefineList);

    // #if _VERBOSE
    this._logErrors(parser.errors);
    // #endif

    if (!program) {
      return undefined;
    }

    const codeGen = backend === ShaderLanguage.GLSLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();

    const codeGenStartTime = performance.now();
    const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
    Logger.info(`[Task - CodeGen] cost time: ${performance.now() - codeGenStartTime}ms`);
    Logger.info(`[Task - Total compilation] cost time: ${performance.now() - totalStartTime}ms`);
    ShaderCompiler._processingPassText = undefined;

    // #if _VERBOSE
    this._logErrors(codeGen.errors);
    // #endif

    if (ret) {
      // Always parse instructions for the compiled GLSL
      ret.vertexShaderInstructions = ShaderInstructionEncoder.parse(ret.vertex);
      ret.fragmentShaderInstructions = ShaderInstructionEncoder.parse(ret.fragment);
    }

    return ret;
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

  // #if _VERBOSE
  /**
   * @internal
   */
  _logErrors(errors: Error[]) {
    if (errors.length === 0 || !Logger.isEnabled) return;
    Logger.error(`${errors.length} errors occur!`);
    for (const err of errors) {
      Logger.error(err.toString());
    }
  }
  // #endif
}
