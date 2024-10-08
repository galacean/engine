import { Lexer } from "./lexer";
import { ShaderTargetParser } from "./parser";
import { Preprocessor } from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { IShaderContent, IShaderLab } from "@galacean/engine-design";
import { ShaderContentParser } from "./contentParser";
// @ts-ignore
import { Logger, ShaderLib, ShaderMacro, ShaderPass, ShaderPlatformTarget } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from "./common";
import { ShaderLabObjectPool } from "./ShaderLabObjectPool";
// #if _VERBOSE
import { GSError } from "./Error";
// #endif
import { PpParser } from "./preprocessor/PpParser";

export class ShaderLab implements IShaderLab {
  private static _parser = ShaderTargetParser.create();
  private static _shaderPositionPool = new ShaderLabObjectPool(ShaderPosition);
  private static _shaderRangePool = new ShaderLabObjectPool(ShaderRange);

  /**
   * @internal
   */
  static _processingPassText?: string;

  static createPosition(index: number, line?: number, column?: number): ShaderPosition {
    const position = this._shaderPositionPool.get();
    position.set(index, line, column);
    return position;
  }

  static createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const range = this._shaderRangePool.get();
    range.set(start, end);
    return range;
  }

  // #if _VERBOSE
  private _errors: GSError[] = [];

  /**
   * Retrieve the compilation errors
   */
  get errors(): GSError[] {
    return this._errors;
  }
  // #endif

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: ShaderMacro[],
    backend: ShaderPlatformTarget,
    platformMacros: string[],
    basePathForIncludeKey: string
  ) {
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
        this._errors.push(<GSError>err);
      }
      this._logErrors(this._errors);
      return { vertex: "", fragment: "" };
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
      this._errors.push(err);
    }
    if (!program) {
      this._logErrors(this._errors);
      return { vertex: "", fragment: "" };
    }
    // #endif

    const codeGen =
      backend === ShaderPlatformTarget.GLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();

    const start = performance.now();
    const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
    Logger.info(`[CodeGen] cost time: ${performance.now() - start}ms`);
    ShaderLab._processingPassText = undefined;

    // #if _VERBOSE
    for (const err of codeGen.errors) {
      this._errors.push(err);
    }
    this._logErrors(this._errors);
    // #endif

    return ret;
  }

  _parseShaderContent(shaderSource: string): IShaderContent {
    ShaderLabObjectPool.clearAllShaderLabObjectPool();
    ShaderContentParser.reset();
    // #if _VERBOSE
    this._errors.length = 0;
    // #endif
    const ret = ShaderContentParser.parse(shaderSource);
    for (const error of ShaderContentParser._errors) {
      this._errors.push(error);
    }
    return ret;
  }

  // #if _VERBOSE
  /**
   * @internal
   * For debug
   */
  _parse(
    shaderSource: string,
    macros: ShaderMacro[] = [],
    backend: ShaderPlatformTarget = ShaderPlatformTarget.GLES100
  ): (ReturnType<ShaderLab["_parseShaderPass"]> & { name: string })[] {
    const structInfo = this._parseShaderContent(shaderSource);
    const passResult = [] as any;
    for (const subShader of structInfo.subShaders) {
      for (const pass of subShader.passes) {
        if (pass.isUsePass) continue;
        const passInfo = this._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          macros,
          backend,
          [],
          // @ts-ignore
          new URL(pass.name, ShaderPass._shaderRootPath).href
        ) as any;
        passInfo.name = pass.name;
        passResult.push(passInfo);
      }
    }
    return passResult;
  }

  /**
   * @internal
   */
  _logErrors(errors: GSError[], source?: string) {
    if (errors.length === 0 || !Logger.isEnabled) return;
    Logger.error(`${errors.length} errors occur!`);
    for (const err of errors) {
      err.log(source);
    }
  }
  // #endif
}
