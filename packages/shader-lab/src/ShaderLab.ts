import { Color, Logger, ShaderMacro, ShaderLanguage } from "@galacean/engine";
import { IPrecompiledShader, IShaderLab, IShaderSource, IRenderStates } from "@galacean/engine-design";
import { IShaderProgramSource } from "@galacean/engine-design/types/shader-lab/IShaderProgramSource";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { ShaderPosition, ShaderRange } from "./common";
import { Lexer } from "./lexer";
import { MacroParser } from "./macroProcessor/MacroParser";
import { ShaderTargetParser } from "./parser";
import { parseSegmentTree } from "./MacroCodeSegment";
import { PRECOMPILE_VERSION } from "./PrecompiledShaderCodec";
import { Preprocessor } from "./Preprocessor";
import { ShaderLabUtils } from "./ShaderLabUtils";
import { ShaderSourceParser } from "./sourceParser/ShaderSourceParser";

export class ShaderLab implements IShaderLab {
  private static _parser = ShaderTargetParser.create();
  private static _shaderPositionPool = ShaderLabUtils.createObjectPool(ShaderPosition);
  private static _shaderRangePool = ShaderLabUtils.createObjectPool(ShaderRange);

  // #if _VERBOSE
  static _processingPassText?: string;
  // #endif

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
    ShaderLabUtils.clearAllShaderLabObjectPool();
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
    const noIncludeContent = Preprocessor.parse(source, basePathForIncludeKey, macroDefineList);
    Logger.info(`[Task - Pre processor] cost time ${performance.now() - totalStartTime}ms`);

    const lexer = new Lexer(noIncludeContent, macroDefineList);

    const tokens = lexer.tokenize();
    const { _parser: parser } = ShaderLab;

    ShaderLab._processingPassText = noIncludeContent;

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
    ShaderLab._processingPassText = undefined;

    // #if _VERBOSE
    this._logErrors(codeGen.errors);
    // #endif

    return ret;
  }

  _parseMacros(content: string, macros: ShaderMacro[]): string {
    const startTime = performance.now();
    const parsedContent = MacroParser.parse(content, macros);
    Logger.info(`[Task -  parse macros] cost time: ${performance.now() - startTime}ms`);

    // #if _VERBOSE
    this._logErrors(MacroParser._errors);
    // #endif

    return parsedContent;
  }

  _precompile(sourceCode: string, platformTarget: ShaderLanguage, basePath: string): IPrecompiledShader {
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
          basePath
        );

        if (!programSource) {
          throw new Error(
            `Shader pass "${shaderSource.name}.${sub.name}.${pass.name}" precompile failed, please check the shader source code.`
          );
        }

        const vertexHasMacros = ShaderLab._hasMacroBranches(programSource.vertex);
        const fragmentHasMacros = ShaderLab._hasMacroBranches(programSource.fragment);

        return {
          name: pass.name,
          isUsePass: false as const,
          tags: pass.tags,
          renderStates: this._serializeRenderStates(pass.renderStates),
          vertexSource: programSource.vertex,
          fragmentSource: programSource.fragment,
          vertexHasMacros,
          fragmentHasMacros,
          vertexSegments: vertexHasMacros ? parseSegmentTree(programSource.vertex) : undefined,
          fragmentSegments: fragmentHasMacros ? parseSegmentTree(programSource.fragment) : undefined
        };
      })
    }));

    return {
      version: PRECOMPILE_VERSION,
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

  private static _macroBranchRegex = /^\s*#\s*(?:if|ifdef|ifndef)\b/m;

  private static _hasMacroBranches(glsl: string): boolean {
    return ShaderLab._macroBranchRegex.test(glsl);
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
