import { Logger, ShaderMacro, ShaderPlatformTarget } from "@galacean/engine";
import { IShaderLab, IShaderSource } from "@galacean/engine-design";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { ShaderPosition, ShaderRange } from "./common";
import { Lexer } from "./lexer";
import { ShaderTargetParser } from "./parser";
// #if _VERBOSE
import { GSError } from "./GSError";
// #endif
import { IShaderProgramSource } from "@galacean/engine-design/types/shader-lab/IShaderProgramSource";
import { PpParser } from "./preprocessor/PpParser";
import { ShaderLabUtils } from "./ShaderLabUtils";
import { ShaderSourceParser } from "./sourceParser/ShaderSourceParser";
import { parseIncludes, parseMacroDefines } from "./Preprocessor";

/** @internal */
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

  // #if _VERBOSE
  readonly errors = new Array<Error>();
  // #endif

  _parseShaderSource(sourceCode: string): IShaderSource {
    ShaderLabUtils.clearAllShaderLabObjectPool();
    const shaderSource = ShaderSourceParser.parse(sourceCode);

    // #if _VERBOSE
    this.errors.length = 0;
    for (const error of ShaderSourceParser.errors) {
      this.errors.push(error);
    }
    // #endif

    return shaderSource;
  }

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    backend: ShaderPlatformTarget,
    basePathForIncludeKey: string
  ): IShaderProgramSource | undefined {
    const totalStartTime = performance.now();
    const noIncludeContent = parseIncludes(source, basePathForIncludeKey);
    const macroDefineList = parseMacroDefines(noIncludeContent);
    Logger.info(`[Pass include compilation] cost time ${performance.now() - totalStartTime}ms`);

    // #if _VERBOSE
    if (PpParser._errors.length > 0) {
      for (const err of PpParser._errors) {
        this.errors.push(<GSError>err);
      }
      this._logErrors();
      return undefined;
    }
    // #endif

    const lexer = new Lexer(noIncludeContent, macroDefineList);

    const tokens = lexer.tokenize();
    const { _parser: parser } = ShaderLab;

    ShaderLab._processingPassText = noIncludeContent;

    const program = parser.parse(tokens, macroDefineList);

    // #if _VERBOSE
    for (const err of parser.errors) {
      this.errors.push(err);
    }
    // #endif
    if (!program) {
      // #if _VERBOSE
      this._logErrors();
      // #endif
      return undefined;
    }

    const codeGen =
      backend === ShaderPlatformTarget.GLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();

    const codeGenStartTime = performance.now();
    const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
    Logger.info(`[Pass CodeGen] cost time: ${performance.now() - codeGenStartTime}ms`);
    Logger.info(`[Pass total compilation] cost time: ${performance.now() - totalStartTime}ms`);
    ShaderLab._processingPassText = undefined;

    // #if _VERBOSE
    for (const err of codeGen.errors) {
      this.errors.push(err);
    }
    this._logErrors();
    // #endif

    return ret;
  }

  _parseDirectives(content: string, macros: ShaderMacro[]): string {
    const startTime = performance.now();
    const parsedContent = PpParser.parse(content, macros);
    Logger.info(`[Pass directives compilation] cost time: ${performance.now() - startTime}ms`);
    return parsedContent;
  }

  // #if _VERBOSE
  /**
   * @internal
   */
  _logErrors() {
    const errors = this.errors;
    if (errors.length === 0 || !Logger.isEnabled) return;
    Logger.error(`${errors.length} errors occur!`);
    for (const err of errors) {
      Logger.error(err.toString());
    }
  }
  // #endif
}
