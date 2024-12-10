import { Lexer } from "./lexer";
import { ShaderTargetParser } from "./parser";
import { Preprocessor } from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { IShaderContent, IShaderLab } from "@galacean/engine-design";
import { ShaderContentParser } from "./contentParser";
// @ts-ignore
import { Logger, ShaderLib, ShaderMacro, ShaderPlatformTarget } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from "./common";
// #if _VERBOSE
import { GSError } from "./GSError";
// #endif
import { PpParser } from "./preprocessor/PpParser";
import { ShaderLabUtils } from "./ShaderLabUtils";
import { IShaderProgramSource } from "@galacean/engine-design/types/shader-lab/IShaderProgramSource";

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
  /** Retrieve the compilation errors */
  readonly errors: GSError[] = [];
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
    Preprocessor.reset(ShaderLib, basePathForIncludeKey);
    for (const macro of macros) {
      Preprocessor.addPredefinedMacro(macro.name, macro.value);
    }

    for (let i = 0; i < platformMacros.length; i++) {
      Preprocessor.addPredefinedMacro(platformMacros[i]);
    }

    const preprocessorStart = performance.now();
    const ppdContent = Preprocessor.process(source);
    // #if _VERBOSE
    if (PpParser._errors.length > 0) {
      for (const err of PpParser._errors) {
        this.errors.push(<GSError>err);
      }
      this._logErrors();
      return undefined;
    }
    // #endif

    Logger.info(`[pass compilation - preprocessor]  cost time ${performance.now() - preprocessorStart}ms`);

    const lexer = new Lexer(ppdContent);
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

    return ret;
  }

  _parseShaderContent(shaderSource: string): IShaderContent {
    ShaderLabUtils.clearAllShaderLabObjectPool();
    ShaderContentParser.reset();
    const ret = ShaderContentParser.parse(shaderSource);

    // #if _VERBOSE
    this.errors.length = 0;
    for (const error of ShaderContentParser._errors) {
      this.errors.push(error);
    }
    // #endif

    return ret;
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
