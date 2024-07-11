import { Lexer } from "./lexer";
import { ShaderTargetParser } from "./parser";
import { Preprocessor } from "./preprocessor";
import { GLES100Visitor, GLES300Visitor } from "./codeGen";
import { ShaderContent, IShaderLab } from "@galacean/engine-design/src/shader-lab";
import { ShaderContentParser } from "./contentParser";
// @ts-ignore
import { ClearableObjectPool, Logger, ShaderLib, ShaderMacro, ShaderPlatformTarget } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from "./common";

export class ShaderLab implements IShaderLab {
  /**
   * @internal
   */
  private static _parser = ShaderTargetParser.create();
  /**
   * @internal
   */
  private static _shaderPositionPool = new ClearableObjectPool(ShaderPosition, 1000);
  /**
   * @internal
   */
  private static _shaderRangePool = new ClearableObjectPool(ShaderRange, 500);

  static createPosition(
    index: number,
    // #if _EDITOR
    line?: number,
    column?: number
    // #endif
  ): ShaderPosition {
    const position = this._shaderPositionPool.get();
    position.setX(
      index,
      // #if _EDITOR
      line,
      column
      // #endif
    );
    return position;
  }

  static createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const range = this._shaderRangePool.get();
    range.setX(start, end);
    return range;
  }

  _parseShaderPass(
    source: string,
    vertexEntry: string,
    fragmentEntry: string,
    macros: ShaderMacro[],
    backend: ShaderPlatformTarget,
    platformMacros: string[]
  ) {
    Preprocessor.reset(ShaderLib);
    for (const macro of macros) {
      Preprocessor.addPredefinedMacro(macro.name, macro.value);
    }

    for (let i = 0; i < platformMacros.length; i++) {
      Preprocessor.addPredefinedMacro(platformMacros[i]);
    }

    // #if _EDITOR
    // TODO: index to position
    // Logger.convertSourceIndex = Preprocessor.convertSourceIndex.bind(Preprocessor);
    // #endif

    const preprocessorStart = performance.now();

    const ppdContent = Preprocessor.process(source);

    Logger.info(`[pass compilation - preprocessor]  cost time ${performance.now() - preprocessorStart}ms`);

    const lexer = new Lexer(ppdContent);
    const tokens = lexer.tokenize();
    const program = ShaderLab._parser.parse(tokens);
    const codeGen =
      backend === ShaderPlatformTarget.GLES100 ? GLES100Visitor.getVisitor() : GLES300Visitor.getVisitor();

    const start = performance.now();
    const ret = codeGen.visitShaderProgram(program, vertexEntry, fragmentEntry);
    Logger.info(`[CodeGen] cost time: ${performance.now() - start}ms`);

    ShaderLab._shaderPositionPool.clear();
    ShaderLab._shaderRangePool.clear();
    return ret;
  }

  _parseShaderContent(shaderSource: string): ShaderContent {
    ShaderContentParser.reset();
    return ShaderContentParser.parse(shaderSource);
  }

  // #if _EDITOR
  /**
   * @internal
   * For debug
   */
  _parse(
    shaderSource: string,
    macros: ShaderMacro[],
    backend: ShaderPlatformTarget
  ): (ReturnType<ShaderLab["_parseShaderPass"]> & { name: string })[] {
    const structInfo = this._parseShaderContent(shaderSource);
    const passResult = [] as any;
    for (const subShader of structInfo.subShaders) {
      for (const pass of subShader.passes) {
        if (!pass.isUsePass) continue;
        const passInfo = this._parseShaderPass(
          pass.contents,
          pass.vertexEntry,
          pass.fragmentEntry,
          macros,
          backend,
          []
        ) as any;
        passInfo.name = pass.name;
        passResult.push(passInfo);
      }
    }
    return passResult;
  }
  // #endif
}
