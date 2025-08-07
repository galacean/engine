import { Logger, ShaderMacro, ShaderPlatformTarget } from "@galacean/engine";
import { IShaderInfo, IShaderLab, IShaderSource } from "@galacean/engine-design";
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

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: ShaderMacro[],
    backend: ShaderPlatformTarget,
    platformMacros: string[],
    basePathForIncludeKey: string
  ): IShaderProgramSource | undefined {
    const preprocessorStartTime = performance.now();

    // console.warn("source:");
    // console.log(source);
    const ppdContent = PpParser.parseInclude(source, basePathForIncludeKey);
    // #if _VERBOSE
    if (PpParser._errors.length > 0) {
      for (const err of PpParser._errors) {
        this.errors.push(<GSError>err);
      }
      this._logErrors();
      return undefined;
    }
    // #endif

    Logger.info(`[Pass preprocessor compilation] cost time ${performance.now() - preprocessorStartTime}ms`);

    const lexer = new Lexer(ppdContent);
    console.warn("ppd:");
    console.log(ppdContent);
    const tokens = lexer.tokenize();

    const { _parser: parser } = ShaderLab;

    ShaderLab._processingPassText = ppdContent;
    const program = parser.parse(tokens);

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

    const start = performance.now();
    const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
    Logger.info(`[CodeGen] cost time: ${performance.now() - start}ms`);
    ShaderLab._processingPassText = undefined;

    // #if _VERBOSE
    for (const err of codeGen.errors) {
      this.errors.push(err);
    }
    this._logErrors();
    // #endif

    // console.warn("vert:");
    // console.log(ret.vertex);
    console.warn("frag:");
    console.log(ret.fragment);

    this._parseShaderPass2(ret, macros, platformMacros);
    return ret;
  }

  _parseShaderPass2(ret: IShaderInfo, macros: ShaderMacro[], platformMacros: string[]) {
    ret.vertex = PpParser.parse(ret.vertex, macros, platformMacros);
    ret.fragment = PpParser.parse(ret.fragment, macros, platformMacros);

    console.warn("final frag:");
    console.log(ret.fragment);
  }

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
