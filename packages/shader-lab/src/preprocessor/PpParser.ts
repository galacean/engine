import { ShaderPosition, ShaderRange } from "../common";
import { BaseToken } from "../common/BaseToken";
import { ShaderLab } from "../ShaderLab";
import { EPpKeyword, EPpToken, PpConstant } from "./constants";
import { MacroDefine } from "./MacroDefine";
import PpLexer from "./PpLexer";
import { PpUtils } from "./Utils";
// @ts-ignore
import { ShaderLib, ShaderMacro, ShaderPass } from "@galacean/engine";
import { GSErrorName } from "../GSError";
import { ShaderLabUtils } from "../ShaderLabUtils";
// #if _VERBOSE
import PpSourceMap, { BlockInfo } from "./sourceMap";
// #endif
import { BaseLexer } from "../common/BaseLexer";

export interface ExpandSegment {
  // #if _VERBOSE
  block?: BlockInfo;
  // #endif
  rangeInBlock: ShaderRange;
  replace: string;
}

/** @internal */
export class PpParser {
  static lexer: PpLexer;

  private static _definedMacros: Map<string, MacroDefine> = new Map();
  private static _expandSegmentsStack: ExpandSegment[][] = [[]];

  /** Referenced by branch macro or defined operator */
  private static _branchMacros: Set<string> = new Set();

  private static _includeMap: Record<string, string>;
  private static _basePathForIncludeKey: string;

  // #if _VERBOSE
  static _errors: Error[] = [];
  // #endif

  static parse(
    source: string,
    macros: ShaderMacro[],
    platformMacros: string[],
    basePathForIncludeKey: string
  ): string | null {
    PpParser._reset(ShaderLib, basePathForIncludeKey);

    for (const macro of macros) {
      PpParser._addPredefinedMacro(macro.name, macro.value);
    }

    for (let i = 0, n = platformMacros.length; i < n; i++) {
      PpParser._addPredefinedMacro(platformMacros[i]);
    }

    this.lexer = new PpLexer(source);
    return PpParser._parseDirectives(this.lexer);
  }

  private static _reset(includeMap: Record<string, string>, basePathForIncludeKey: string) {
    this._definedMacros.clear();
    this._expandSegmentsStack.length = 0;
    this._expandSegmentsStack.push([]);
    this._branchMacros.clear();
    this._addPredefinedMacro("GL_ES");
    this._includeMap = includeMap;
    this._basePathForIncludeKey = basePathForIncludeKey;
    // #if _VERBOSE
    this._errors.length = 0;
    // #endif
  }

  private static _addPredefinedMacro(macro: string, value?: string) {
    const tk = BaseToken.pool.get();
    tk.set(EPpToken.id, macro);

    let macroBody: BaseToken | undefined;
    if (value) {
      macroBody = BaseToken.pool.get();
      macroBody.set(EPpToken.id, value);
    }

    this._definedMacros.set(macro, new MacroDefine(tk, macroBody));
  }

  private static _parseDirectives(scanner: PpLexer): string | null {
    while (!scanner.isEnd()) {
      const directive = scanner.scanDirective(this._onToken.bind(this))!;
      if (scanner.isEnd()) break;
      switch (directive.type) {
        case EPpKeyword.define:
          this._parseDefine(scanner);
          break;
        case EPpKeyword.undef:
          this._parseUndef(scanner);
          break;
        case EPpKeyword.if:
          this._parseIf(scanner);
          break;
        case EPpKeyword.ifndef:
          this._parseIfNdef(scanner);
          break;
        case EPpKeyword.ifdef:
          this._parseIfDef(scanner);
          break;
        case EPpKeyword.include:
          this._parseInclude(scanner);
          break;
      }
    }
    // #if _VERBOSE
    if (this._errors.length > 0) return null;
    // #endif

    return PpUtils.expand(this._getExpandSegments(), scanner.source, scanner.sourceMap);
  }

  private static _getExpandSegments(): ExpandSegment[] {
    return this._expandSegmentsStack[this._expandSegmentsStack.length - 1];
  }

  private static _reportError(loc: ShaderRange | ShaderPosition, message: string, source: string, file: string) {
    const error = ShaderLabUtils.createGSError(message, GSErrorName.PreprocessorError, source, loc, file);
    // #if _VERBOSE
    this._errors.push(error);
    // #endif
  }

  private static _parseInclude(scanner: PpLexer) {
    const start = scanner.getShaderPosition(8);

    scanner.skipSpace(true);
    const id = scanner.scanQuotedString();
    let includedPath: string;
    // builtin path
    if (id.lexeme[0] !== ".") {
      includedPath = id.lexeme;
    } else {
      // relative path
      // @ts-ignore
      includedPath = new URL(id.lexeme, this._basePathForIncludeKey).href.substring(ShaderPass._shaderRootPath.length);
    }

    scanner.scanToChar("\n");
    const end = scanner.getShaderPosition(0);
    const chunk = this._includeMap[includedPath];
    if (!chunk) {
      this._reportError(id.location, `Shader slice "${includedPath}" not founded.`, scanner.source, scanner.file);
      return;
    }

    const range = ShaderLab.createRange(start, end);
    const expanded = this._expandMacroChunk(chunk, range, id.lexeme);
    // #if _VERBOSE
    const block = new BlockInfo(id.lexeme, undefined, expanded.sourceMap);
    // #endif
    this._getExpandSegments().push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: range,
      replace: expanded.content
    });
  }

  private static _parseIfDef(lexer: PpLexer): void {
    const start = lexer.currentIndex - 6;
    const macroToken = lexer.scanWord();
    this._branchMacros.add(macroToken.lexeme);

    lexer.skipSpace(true);
    const { token: bodyToken, nextDirective } = lexer.scanMacroBranchChunk();

    const defined = this._definedMacros.get(macroToken.lexeme);
    if (defined) {
      const end = nextDirective.type === EPpKeyword.endif ? lexer.getShaderPosition(0) : lexer.scanRemainMacro();
      const expanded = this._expandMacroChunk(bodyToken.lexeme, bodyToken.location, lexer);
      // #if _VERBOSE
      const block = new BlockInfo(lexer.file, lexer.blockRange, expanded.sourceMap);
      // #endif

      const range = ShaderLab.createRange(ShaderLab.createPosition(start), end);

      this._getExpandSegments().push({
        // #if _VERBOSE
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
    } else {
      this._addEmptyReplace(lexer, start);
      this._processConditionalDirective(nextDirective.type, lexer);
    }
  }

  private static _processConditionalDirective(
    directive: EPpKeyword.elif | EPpKeyword.else | EPpKeyword.endif,
    scanner: PpLexer
  ) {
    if (directive === EPpKeyword.endif) {
      return;
    }

    const start = scanner.currentIndex;

    if (directive === EPpKeyword.else) {
      const { token: elseChunk } = scanner.scanMacroBranchChunk();
      const expanded = this._expandMacroChunk(elseChunk.lexeme, elseChunk.location, scanner);
      // #if _VERBOSE
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const startPosition = ShaderLab.createPosition(start);
      const range = ShaderLab.createRange(startPosition, scanner.getShaderPosition(0));
      this._getExpandSegments().push({
        // #if _VERBOSE
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
    } else if (directive === EPpKeyword.elif) {
      const constantExpr = this._parseConstantExpression(scanner);
      const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
      if (constantExpr) {
        const end = nextDirective.type === EPpKeyword.endif ? scanner.currentIndex : scanner.scanRemainMacro().index;
        const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
        // #if _VERBOSE
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const startPosition = ShaderLab.createPosition(start);
        const endPosition = ShaderLab.createPosition(end);
        const range = ShaderLab.createRange(startPosition, endPosition);
        this._getExpandSegments().push({
          // #if _VERBOSE
          block,
          // #endif
          rangeInBlock: range,
          replace: expanded.content
        });
      } else {
        // #if _VERBOSE
        const block = new BlockInfo(scanner.file, scanner.blockRange);
        // #endif
        const startPosition = ShaderLab.createPosition(start);
        const endPosition = ShaderLab.createPosition(scanner.currentIndex);
        const range = ShaderLab.createRange(startPosition, endPosition);
        this._getExpandSegments().push({
          // #if _VERBOSE
          block,
          // #endif
          rangeInBlock: range,
          replace: ""
        });
        this._processConditionalDirective(nextDirective.type, scanner);
      }
    }
  }

  private static _parseConstantExpression(scanner: PpLexer) {
    scanner.skipSpace(true);
    return this._parseLogicalOrExpression(scanner);
  }

  private static _parseLogicalOrExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseLogicalAndExpression(scanner);
    const operator = scanner.peek(2);
    if (operator && operator === "||") {
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this._parseLogicalOrExpression(scanner);
      return operand1 || operand2;
    }
    return operand1;
  }

  private static _parseLogicalAndExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseEqualityExpression(scanner);
    const operator = scanner.peek(2);
    if (operator && operator === "&&") {
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this._parseLogicalAndExpression(scanner);
      return operand1 && operand2;
    }
    return operand1;
  }

  private static _parseEqualityExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseRelationalExpression(scanner);
    const operator = scanner.peek(2);
    if (operator && ["==", "!="].includes(operator)) {
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this._parseEqualityExpression(scanner);
      switch (operator) {
        case "==":
          return operand1 === operand2;
        case "!=":
          return operand1 !== operand2;
      }
    }
    return operand1;
  }

  private static _parseRelationalExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseShiftExpression(scanner) as number;
    let operator = scanner.peek(2);
    if (operator[1] !== "=") operator = operator[0];
    if (operator && [">", "<", ">=", "<="].includes(operator)) {
      const opPos = scanner.getShaderPosition(0);
      scanner.advance(operator.length);
      scanner.skipSpace(false);
      const operand2 = this._parseRelationalExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this._reportError(opPos, "invalid operator in relation expression.", scanner.source, scanner.file);
        return;
      }
      switch (operator) {
        case ">":
          return operand1 > operand2;
        case "<":
          return operand1 < operand2;
        case ">=":
          return operand1 >= operand2;
        case "<=":
          return operand1 <= operand2;
      }
    }
    return operand1;
  }

  private static _parseShiftExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseAdditiveExpression(scanner) as number;
    const operator = scanner.peek(2);
    if (operator && [">>", "<<"].includes(operator)) {
      const opPos = scanner.getShaderPosition(0);
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this._parseShiftExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this._reportError(opPos, "invalid operator in shift expression.", scanner.source, scanner.file);
        return;
      }
      switch (operator) {
        case ">>":
          return operand1 >> operand2;
        case "<<":
          return operand1 << operand2;
      }
    }

    return operand1;
  }

  private static _parseAdditiveExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseMulticativeExpression(scanner) as number;
    if ([">", "<"].includes(scanner.getCurChar())) {
      const opPos = scanner.getShaderPosition(0);
      scanner.advance(1);

      const operator = scanner.getCurChar();
      scanner.skipSpace(false);
      const operand2 = this._parseAdditiveExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this._reportError(opPos, "invalid operator.", scanner.source, scanner.file);
        return false;
      }
      switch (operator) {
        case "+":
          return operand1 + operand2;
        case "-":
          return operand1 - operand2;
      }
    }
    return operand1;
  }

  private static _parseMulticativeExpression(scanner: PpLexer): PpConstant {
    const operand1 = this._parseUnaryExpression(scanner) as number;
    scanner.skipSpace(false);
    if (["*", "/", "%"].includes(scanner.getCurChar())) {
      const opPos = scanner.getShaderPosition(0);
      const operator = scanner.getCurChar();
      scanner.skipSpace(false);
      const operand2 = this._parseMulticativeExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this._reportError(opPos, "invalid operator.", scanner.source, scanner.file);
        return;
      }
      switch (operator) {
        case "*":
          return operand1 * operand2;
        case "/":
          return operand1 / operand2;
        case "%":
          return operand1 % operand2;
      }
    }
    return operand1;
  }

  private static _parseUnaryExpression(scanner: PpLexer) {
    const operator = scanner.getCurChar();
    if (["+", "-", "!"].includes(operator)) {
      scanner.advance(1);
      const opPos = scanner.getShaderPosition(0);
      const parenExpr = this._parseParenthesisExpression(scanner);
      if ((operator === "!" && typeof parenExpr !== "boolean") || (operator !== "!" && typeof parenExpr !== "number")) {
        this._reportError(opPos, "invalid operator.", scanner.source, scanner.file);
      }

      switch (operator) {
        case "+":
          return parenExpr;
        case "-":
          return -parenExpr;
        case "!":
          return !parenExpr;
      }
    }
    return this._parseParenthesisExpression(scanner);
  }

  private static _parseParenthesisExpression(scanner: PpLexer): PpConstant {
    if (scanner.getCurChar() === "(") {
      scanner.advance(1);
      scanner.skipSpace(false);
      const ret = this._parseConstantExpression(scanner);
      scanner.scanToChar(")");
      scanner.advance(1);
      return ret;
    }
    return this._parseConstant(scanner);
  }

  private static _parseConstant(scanner: PpLexer): PpConstant {
    if (BaseLexer.isAlpha(scanner.getCurCharCode())) {
      const id = scanner.scanWord();
      if (id.type === EPpKeyword.defined) {
        const withParen = scanner.peekNonSpace() === "(";
        const macro = scanner.scanWord();
        if (withParen) {
          scanner.scanToChar(")");
          scanner.advance(1);
        }
        this._branchMacros.add(macro.lexeme);
        return !!this._definedMacros.get(macro.lexeme);
      } else {
        const macro = this._definedMacros.get(id.lexeme);
        if (!macro || !macro.body) {
          return false;
        }
        if (macro.isFunction) {
          this._reportError(id.location, "invalid function macro usage", scanner.source, scanner.file);
        }
        const value = Number(macro.body.lexeme);
        if (!Number.isInteger(value)) {
          this._reportError(id.location, `invalid const macro: ${id.lexeme}`, scanner.source, scanner.file);
        }
        this._branchMacros.add(id.lexeme);
        return value;
      }
    } else if (BaseLexer.isDigit(scanner.getCurCharCode())) {
      const integer = scanner.scanInteger();
      return Number(integer.lexeme);
    } else {
      this._reportError(
        scanner.getShaderPosition(0),
        `invalid token: ${scanner.getCurChar()}`,
        scanner.source,
        scanner.file
      );
    }
  }

  /**
   * Recursively expand macro body and expansion.
   */
  private static _expandMacroChunk(
    chunk: string,
    loc: ShaderRange,
    parentScanner: PpLexer
  ): {
    content: string;
    // #if _VERBOSE
    sourceMap: PpSourceMap;
    // #endif
  };
  private static _expandMacroChunk(
    chunk: string,
    loc: ShaderRange,
    file: string
  ): {
    content: string;
    // #if _VERBOSE
    sourceMap: PpSourceMap;
    // #endif
  };
  private static _expandMacroChunk(
    chunk: string,
    loc: ShaderRange,
    scannerOrFile: PpLexer | string
  ): {
    content: string;
    // #if _VERBOSE
    sourceMap: PpSourceMap;
    // #endif
  } {
    this._expandSegmentsStack.push([]);
    let scanner: PpLexer;
    if (typeof scannerOrFile === "string") {
      scanner = new PpLexer(chunk, scannerOrFile);
    } else {
      scanner = new PpLexer(chunk, scannerOrFile.file, loc);
    }
    const ret = this._parseDirectives(scanner);
    this._expandSegmentsStack.pop();
    return {
      content: ret,
      // #if _VERBOSE
      sourceMap: scanner.sourceMap
      // #endif
    };
  }

  private static _parseIfNdef(scanner: PpLexer) {
    const start = scanner.currentIndex - 7;

    const id = scanner.scanWord();
    this._addEmptyReplace(scanner, start);
    this._branchMacros.add(id.lexeme);

    const macro = this._definedMacros.get(id.lexeme);
    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition(0) : scanner.scanRemainMacro();

      const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _VERBOSE
      const blockInfo = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);
      this._getExpandSegments().push({
        // #if _VERBOSE
        block: blockInfo,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
      return;
    }

    const expandSegments = this._getExpandSegments();
    expandSegments[expandSegments.length - 1].rangeInBlock.end = scanner.getShaderPosition(0);
    this._processConditionalDirective(nextDirective.type, scanner);
  }

  private static _addEmptyReplace(lexer: PpLexer, start: number) {
    // #if _VERBOSE
    const block = new BlockInfo(lexer.file, lexer.blockRange);
    // #endif

    const startPosition = ShaderLab.createPosition(start);
    const endPosition = lexer.getShaderPosition(0);
    const range = ShaderLab.createRange(startPosition, endPosition);
    this._getExpandSegments().push({
      // #if _VERBOSE
      block,
      // #endif

      rangeInBlock: range,
      replace: ""
    });
  }

  private static _parseIf(scanner: PpLexer) {
    const start = scanner.currentIndex - 3;

    const constantExpr = this._parseConstantExpression(scanner);
    this._addEmptyReplace(scanner, start);

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (constantExpr) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition(0) : scanner.scanRemainMacro();
      const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _VERBOSE
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);
      this._getExpandSegments().push({
        // #if _VERBOSE
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
      return;
    }

    const expandSegments = this._getExpandSegments();
    expandSegments[expandSegments.length - 1].rangeInBlock.end = scanner.getShaderPosition(0);
    this._processConditionalDirective(nextDirective.type, scanner);
  }

  private static _parseDefine(scanner: PpLexer) {
    const start = scanner.getShaderPosition(7);
    const macro = scanner.scanWord();

    let end = macro.location.end;
    if (this._definedMacros.get(macro.lexeme) && macro.lexeme.startsWith("GL_")) {
      this._reportError(macro.location, `redefined macro: ${macro.lexeme}`, scanner.source, scanner.file);
    }

    let macroArgs: BaseToken[] | undefined;
    if (scanner.getCurChar() === "(") {
      macroArgs = scanner.scanWordsUntilTerminator(")");
      end = scanner.getShaderPosition(0);
    }
    const macroBody = scanner.scanLineRemain();
    const range = ShaderLab.createRange(start, end);
    const macroDefine = new MacroDefine(macro, macroBody, range, macroArgs);
    this._definedMacros.set(macro.lexeme, macroDefine);

    // #if _VERBOSE
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif

    this._getExpandSegments().push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: ShaderLab.createRange(start, scanner.getShaderPosition(0)),
      replace: ""
    });
  }

  private static _parseUndef(scanner: PpLexer) {
    const start = scanner.currentIndex - 6;
    const macro = scanner.scanWord();

    // #if _VERBOSE
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    const startPosition = ShaderLab.createPosition(start);
    const range = ShaderLab.createRange(startPosition, scanner.getShaderPosition(0));
    this._getExpandSegments().push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: range,
      replace: ""
    });
    this._definedMacros.delete(macro.lexeme);
  }

  private static _onToken(token: BaseToken, scanner: PpLexer) {
    const macro = this._definedMacros.get(token.lexeme);
    if (macro) {
      let replace = macro.body.lexeme;
      if (macro.isFunction) {
        scanner.scanToChar("(");
        scanner.advance(1);

        // extract parameters
        const args: string[] = [];
        let curLvl = 1;
        let curIdx = scanner.currentIndex;
        while (true) {
          if (scanner.getCurChar() === "(") curLvl += 1;
          else if (scanner.getCurChar() === ")") {
            curLvl -= 1;
            if (curLvl === 0) break;
          } else if (scanner.getCurChar() === "," && curLvl === 1) {
            args.push(scanner.source.slice(curIdx, scanner.currentIndex));
            curIdx = scanner.currentIndex + 1;
          }
          scanner.advance(1);
        }
        args.push(scanner.source.slice(curIdx, scanner.currentIndex));

        scanner.advance(1);
        const range = ShaderLab.createRange(token.location!.start, scanner.getShaderPosition(0));
        replace = macro.expandFunctionBody(args);
        const expanded = this._expandMacroChunk(replace, range, scanner);
        // #if _VERBOSE
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const blockRange = ShaderLab.createRange(token.location!.start, scanner.getShaderPosition(0));
        this._getExpandSegments().push({
          // #if _VERBOSE
          block,
          // #endif
          rangeInBlock: blockRange,
          replace: expanded.content
        });
      } else {
        const expanded = this._expandMacroChunk(replace, token.location, scanner);
        // #if _VERBOSE
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const range = ShaderLab.createRange(token.location.start, token.location.end);
        this._getExpandSegments().push({
          // #if _VERBOSE
          block,
          // #endif
          rangeInBlock: range,
          replace: expanded.content
        });
      }
    }
  }

  // #if _VERBOSE
  static convertSourceIndex(index: number) {
    return this.lexer.sourceMap.map(index);
  }
  // #endif
}
