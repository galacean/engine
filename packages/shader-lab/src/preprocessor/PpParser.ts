import { ShaderPosition, ShaderRange } from "../common";
import LexerUtils from "../lexer/Utils";
import { MacroDefine } from "./MacroDefine";
import { BaseToken } from "../common/BaseToken";
import { EPpKeyword, EPpToken, PpConstant } from "./constants";
import PpScanner from "./PpScanner";
import { PpUtils } from "./Utils";
import { ShaderLab } from "../ShaderLab";
import { ShaderPass } from "@galacean/engine";
import { ShaderLabUtils } from "../ShaderLabUtils";
import { GSErrorName } from "../GSError";
// #if _VERBOSE
import PpSourceMap, { BlockInfo } from "./sourceMap";
// #endif

export interface ExpandSegment {
  // #if _VERBOSE
  block?: BlockInfo;
  // #endif
  rangeInBlock: ShaderRange;
  replace: string;
}

/** @internal */
export class PpParser {
  private static _definedMacros: Map<string, MacroDefine> = new Map();
  private static _expandSegmentsStack: ExpandSegment[][] = [[]];

  /** Referenced by branch macro or defined operator */
  private static _branchMacros: Set<string> = new Set();

  private static _includeMap: Record<string, string>;
  private static _basePathForIncludeKey: string;

  // #if _VERBOSE
  static _errors: Error[] = [];
  // #endif

  static reset(includeMap: Record<string, string>, basePathForIncludeKey: string) {
    this._definedMacros.clear();
    this._expandSegmentsStack.length = 0;
    this._expandSegmentsStack.push([]);
    this._branchMacros.clear();
    this.addPredefinedMacro("GL_ES");
    this._includeMap = includeMap;
    this._basePathForIncludeKey = basePathForIncludeKey;
    // #if _VERBOSE
    this._errors.length = 0;
    // #endif
  }

  static addPredefinedMacro(macro: string, value?: string) {
    const tk = BaseToken.pool.get();
    tk.set(EPpToken.id, macro);

    let macroBody: BaseToken | undefined;
    if (value) {
      macroBody = BaseToken.pool.get();
      macroBody.set(EPpToken.id, value);
    }

    this._definedMacros.set(macro, new MacroDefine(tk, macroBody));
  }

  static parse(scanner: PpScanner): string | null {
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

    return PpUtils.expand(this.expandSegments, scanner.source, scanner.sourceMap);
  }

  private static get expandSegments() {
    return this._expandSegmentsStack[this._expandSegmentsStack.length - 1];
  }

  private static reportError(loc: ShaderRange | ShaderPosition, message: string, source: string, file: string) {
    const error = ShaderLabUtils.createGSError(message, GSErrorName.PreprocessorError, source, loc, file);
    this._errors.push(error);
  }

  private static _parseInclude(scanner: PpScanner) {
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
    const end = scanner.getShaderPosition();
    const chunk = this._includeMap[includedPath];
    if (!chunk) {
      this.reportError(id.location, `Shader slice "${includedPath}" not founded.`, scanner.source, scanner.file);
      return;
    }

    const range = ShaderLab.createRange(start, end);
    const expanded = this._expandMacroChunk(chunk, range, id.lexeme);
    // #if _VERBOSE
    const block = new BlockInfo(id.lexeme, undefined, expanded.sourceMap);
    // #endif
    this.expandSegments.push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: range,
      replace: expanded.content
    });
  }

  private static _parseIfDef(scanner: PpScanner) {
    const start = scanner.current - 6;

    const id = scanner.scanWord();
    this._addEmptyReplace(scanner, start);
    this._branchMacros.add(id.lexeme);

    const macro = this._definedMacros.get(id.lexeme);
    scanner.skipSpace(true);

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition() : scanner.scanRemainMacro();

      const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);

      // #if _VERBOSE
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);

      this.expandSegments.push({
        // #if _VERBOSE
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });

      return;
    }

    this.expandSegments.pop();
    this._addEmptyReplace(scanner, start);

    this._parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private static _parseMacroBranch(
    directive: EPpKeyword.elif | EPpKeyword.else | EPpKeyword.endif,
    scanner: PpScanner
  ) {
    if (directive === EPpKeyword.endif) {
      return;
    }

    const start = scanner.current;

    if (directive === EPpKeyword.else) {
      const { token: elseChunk } = scanner.scanMacroBranchChunk();
      const expanded = this._expandMacroChunk(elseChunk.lexeme, elseChunk.location, scanner);
      // #if _VERBOSE
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const startPosition = ShaderLab.createPosition(start);
      const range = ShaderLab.createRange(startPosition, scanner.getShaderPosition());
      this.expandSegments.push({
        // #if _VERBOSE
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
    } else if (directive === EPpKeyword.elif) {
      const constantExpr = this._parseConstantExpression(scanner);
      const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
      if (!!constantExpr) {
        const end = nextDirective.type === EPpKeyword.endif ? scanner.current : scanner.scanRemainMacro().index;
        const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
        // #if _VERBOSE
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const startPosition = ShaderLab.createPosition(start);
        const endPosition = ShaderLab.createPosition(end);
        const range = ShaderLab.createRange(startPosition, endPosition);
        this.expandSegments.push({
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
        const endPosition = ShaderLab.createPosition(scanner.current);
        const range = ShaderLab.createRange(startPosition, endPosition);
        this.expandSegments.push({
          // #if _VERBOSE
          block,
          // #endif
          rangeInBlock: range,
          replace: ""
        });
        this._parseMacroBranch(<any>nextDirective.type, scanner);
      }
    }
  }

  private static _parseConstantExpression(scanner: PpScanner) {
    scanner.skipSpace(true);
    return this._parseLogicalOrExpression(scanner);
  }

  private static _parseLogicalOrExpression(scanner: PpScanner): PpConstant {
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

  private static _parseLogicalAndExpression(scanner: PpScanner): PpConstant {
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

  private static _parseEqualityExpression(scanner: PpScanner): PpConstant {
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

  private static _parseRelationalExpression(scanner: PpScanner): PpConstant {
    const operand1 = this._parseShiftExpression(scanner) as number;
    let operator = scanner.peek(2);
    if (operator[1] !== "=") operator = operator[0];
    if (operator && [">", "<", ">=", "<="].includes(operator)) {
      const opPos = scanner.getShaderPosition();
      scanner.advance(operator.length);
      scanner.skipSpace(false);
      const operand2 = this._parseRelationalExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.reportError(opPos, "invalid operator in relation expression.", scanner.source, scanner.file);
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

  private static _parseShiftExpression(scanner: PpScanner): PpConstant {
    const operand1 = this._parseAdditiveExpression(scanner) as number;
    const operator = scanner.peek(2);
    if (operator && [">>", "<<"].includes(operator)) {
      const opPos = scanner.getShaderPosition();
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this._parseShiftExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.reportError(opPos, "invalid operator in shift expression.", scanner.source, scanner.file);
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

  private static _parseAdditiveExpression(scanner: PpScanner): PpConstant {
    const operand1 = this._parseMulticativeExpression(scanner) as number;
    if ([">", "<"].includes(scanner.getCurChar())) {
      const opPos = scanner.getShaderPosition();
      scanner.advance();

      const operator = scanner.getCurChar();
      scanner.skipSpace(false);
      const operand2 = this._parseAdditiveExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.reportError(opPos, "invalid operator.", scanner.source, scanner.file);
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

  private static _parseMulticativeExpression(scanner: PpScanner): PpConstant {
    const operand1 = this._parseUnaryExpression(scanner) as number;
    scanner.skipSpace(false);
    if (["*", "/", "%"].includes(scanner.getCurChar())) {
      const opPos = scanner.getShaderPosition();
      const operator = scanner.getCurChar();
      scanner.skipSpace(false);
      const operand2 = this._parseMulticativeExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.reportError(opPos, "invalid operator.", scanner.source, scanner.file);
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

  private static _parseUnaryExpression(scanner: PpScanner) {
    const operator = scanner.getCurChar();
    if (["+", "-", "!"].includes(operator)) {
      scanner.advance();
      const opPos = scanner.getShaderPosition();
      const parenExpr = this._parseParenthesisExpression(scanner);
      if ((operator === "!" && typeof parenExpr !== "boolean") || (operator !== "!" && typeof parenExpr !== "number")) {
        this.reportError(opPos, "invalid operator.", scanner.source, scanner.file);
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

  private static _parseParenthesisExpression(scanner: PpScanner): PpConstant {
    if (scanner.getCurChar() === "(") {
      scanner.advance();
      scanner.skipSpace(false);
      const ret = this._parseConstantExpression(scanner);
      scanner.scanToChar(")");
      scanner.advance();
      return ret;
    }
    return this._parseConstant(scanner);
  }

  private static _parseConstant(scanner: PpScanner): PpConstant {
    if (LexerUtils.isAlpha(scanner.getCurChar())) {
      const id = scanner.scanWord();
      if (id.type === EPpKeyword.defined) {
        const withParen = scanner.peekNonSpace() === "(";
        const macro = scanner.scanWord(true);
        if (withParen) {
          scanner.scanToChar(")");
          scanner.advance();
        }
        this._branchMacros.add(macro.lexeme);
        return !!this._definedMacros.get(macro.lexeme);
      } else {
        const macro = this._definedMacros.get(id.lexeme);
        if (!macro) {
          return false;
        }
        if (macro.isFunction) {
          this.reportError(id.location, "invalid function macro usage", scanner.source, scanner.file);
        }
        const value = Number(macro.body.lexeme);
        if (!Number.isInteger(value)) {
          this.reportError(id.location, `invalid const macro: ${id.lexeme}`, scanner.source, scanner.file);
        }
        this._branchMacros.add(id.lexeme);
        return value;
      }
    } else if (LexerUtils.isNum(scanner.getCurChar())) {
      const integer = scanner.scanInteger();
      return Number(integer.lexeme);
    } else {
      this.reportError(
        scanner.getShaderPosition(),
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
    parentScanner: PpScanner
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
    scannerOrFile: PpScanner | string
  ): {
    content: string;
    // #if _VERBOSE
    sourceMap: PpSourceMap;
    // #endif
  } {
    this._expandSegmentsStack.push([]);
    let scanner: PpScanner;
    if (typeof scannerOrFile === "string") {
      scanner = new PpScanner(chunk, scannerOrFile);
    } else {
      scanner = new PpScanner(chunk, scannerOrFile.file, loc);
    }
    const ret = this.parse(scanner);
    this._expandSegmentsStack.pop();
    return {
      content: ret,
      // #if _VERBOSE
      sourceMap: scanner.sourceMap
      // #endif
    };
  }

  private static _parseIfNdef(scanner: PpScanner) {
    const start = scanner.current - 7;

    const id = scanner.scanWord();
    this._addEmptyReplace(scanner, start);
    this._branchMacros.add(id.lexeme);

    const macro = this._definedMacros.get(id.lexeme);
    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition() : scanner.scanRemainMacro();

      const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _VERBOSE
      const blockInfo = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);
      this.expandSegments.push({
        // #if _VERBOSE
        block: blockInfo,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
      return;
    }

    this.expandSegments.pop();
    this._addEmptyReplace(scanner, start);
    this._parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private static _addEmptyReplace(scanner: PpScanner, start: number) {
    // #if _VERBOSE
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    const startPosition = ShaderLab.createPosition(start);
    const endPosition = scanner.getCurPosition();
    const range = ShaderLab.createRange(startPosition, endPosition);
    this.expandSegments.push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: range,
      replace: ""
    });
  }

  private static _parseIf(scanner: PpScanner) {
    const start = scanner.current - 3;

    const constantExpr = this._parseConstantExpression(scanner);
    this._addEmptyReplace(scanner, start);

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!!constantExpr) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition() : scanner.scanRemainMacro();
      const expanded = this._expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _VERBOSE
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);
      this.expandSegments.push({
        // #if _VERBOSE
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
      return;
    }

    this.expandSegments.pop();
    this._addEmptyReplace(scanner, start);
    this._parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private static _parseDefine(scanner: PpScanner) {
    const start = scanner.getShaderPosition(7);
    const macro = scanner.scanWord();

    let end = macro.location.end;
    if (this._definedMacros.get(macro.lexeme) && macro.lexeme.startsWith("GL_")) {
      this.reportError(macro.location, `redefined macro: ${macro.lexeme}`, scanner.source, scanner.file);
    }

    let macroArgs: BaseToken[] | undefined;
    if (scanner.getCurChar() === "(") {
      macroArgs = scanner.scanWordsUntilChar(")");
      end = scanner.getShaderPosition();
    }
    const macroBody = scanner.scanLineRemain();
    const range = ShaderLab.createRange(start, end);
    const macroDefine = new MacroDefine(macro, macroBody, range, macroArgs);
    this._definedMacros.set(macro.lexeme, macroDefine);

    // #if _VERBOSE
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif

    this.expandSegments.push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: ShaderLab.createRange(start, scanner.getCurPosition()),
      replace: ""
    });
  }

  private static _parseUndef(scanner: PpScanner) {
    const start = scanner.current - 6;
    const macro = scanner.scanWord();

    // #if _VERBOSE
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    const startPosition = ShaderLab.createPosition(start);
    const range = ShaderLab.createRange(startPosition, scanner.getCurPosition());
    this.expandSegments.push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: range,
      replace: ""
    });
    this._definedMacros.delete(macro.lexeme);
  }

  private static _onToken(token: BaseToken, scanner: PpScanner) {
    this._skipEditorBlock(token, scanner);
    this._expandToken(token, scanner);
  }

  private static _skipEditorBlock(token: BaseToken, scanner: PpScanner) {
    if (token.lexeme === "EditorProperties" || token.lexeme === "EditorMacros") {
      const start = scanner.current - token.lexeme.length;
      scanner.scanPairedBlock("{", "}");
      const end = scanner.current;
      const startPosition = ShaderLab.createPosition(start);
      const endPosition = ShaderLab.createPosition(end);
      const range = ShaderLab.createRange(startPosition, endPosition);
      this.expandSegments.push({ rangeInBlock: range, replace: "" });
    }
  }

  private static _expandToken(token: BaseToken, scanner: PpScanner) {
    const macro = this._definedMacros.get(token.lexeme);
    if (macro) {
      let replace = macro.body.lexeme;
      if (macro.isFunction) {
        scanner.scanToChar("(");
        scanner.advance();

        // extract parameters
        const args: string[] = [];
        let curLvl = 1;
        let curIdx = scanner.current;
        while (true) {
          if (scanner.getCurChar() === "(") curLvl += 1;
          else if (scanner.getCurChar() === ")") {
            curLvl -= 1;
            if (curLvl === 0) break;
          } else if (scanner.getCurChar() === "," && curLvl === 1) {
            args.push(scanner.source.slice(curIdx, scanner.current));
            curIdx = scanner.current + 1;
          }
          scanner.advance();
        }
        args.push(scanner.source.slice(curIdx, scanner.current));

        scanner.advance();
        const range = ShaderLab.createRange(token.location!.start, scanner.getCurPosition());
        replace = macro.expandFunctionBody(args);
        const expanded = this._expandMacroChunk(replace, range, scanner);
        // #if _VERBOSE
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const blockRange = ShaderLab.createRange(token.location!.start, scanner.getCurPosition());
        this.expandSegments.push({
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
        this.expandSegments.push({
          // #if _VERBOSE
          block,
          // #endif
          rangeInBlock: range,
          replace: expanded.content
        });
      }
    }
  }
}
