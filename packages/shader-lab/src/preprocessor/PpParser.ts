import { ShaderPosition, ShaderRange } from "../common";
import { BaseToken } from "../common/BaseToken";
import { ShaderLab } from "../ShaderLab";
import { PpConstant, PpKeyword, PpToken } from "./constants";
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

  private static _expandVisitedMacros: Record<string, number> = {};
  private static _expandVersionId: number = 1;

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
    tk.set(PpToken.id, macro);

    let macroBody: BaseToken | undefined;
    if (value) {
      macroBody = BaseToken.pool.get();
      macroBody.set(PpToken.id, value);
    }

    this._definedMacros.set(macro, new MacroDefine(tk, macroBody));
  }

  private static _parseDirectives(lexer: PpLexer): string | null {
    while (!lexer.isEnd()) {
      const directive = lexer.scanToken()!;
      if (lexer.isEnd()) break;
      switch (directive.type) {
        case PpToken.id:
          this._parseMacro(lexer, directive);
          break;
        case PpKeyword.define:
          this._parseDefine(lexer);
          break;
        case PpKeyword.undef:
          this._parseUndef(lexer);
          break;
        case PpKeyword.if:
          this._parseIfDirective(lexer, PpKeyword.if);
          break;
        case PpKeyword.ifndef:
          this._parseIfDirective(lexer, PpKeyword.ifndef);
          break;
        case PpKeyword.ifdef:
          this._parseIfDirective(lexer, PpKeyword.ifdef);
          break;
        case PpKeyword.include:
          this._parseInclude(lexer);
          break;
      }
    }
    // #if _VERBOSE
    if (this._errors.length > 0) return null;
    // #endif

    return PpUtils.expand(this._getExpandSegments(), lexer.source, lexer.sourceMap);
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

  private static _parseInclude(lexer: PpLexer): void {
    const start = lexer.getShaderPosition(8);

    lexer.skipSpace(true);
    const pathToken = lexer.scanQuotedString();
    let path: string;
    // builtin path
    if (pathToken.lexeme[0] !== ".") {
      path = pathToken.lexeme;
    } else {
      // relative path
      // @ts-ignore
      path = new URL(pathToken.lexeme, this._basePathForIncludeKey).href.substring(ShaderPass._shaderRootPath.length);
    }

    lexer.scanToChar("\n");
    const end = lexer.getShaderPosition(0);
    const chunk = this._includeMap[path];
    if (!chunk) {
      this._reportError(pathToken.location, `Shader slice "${path}" not founded.`, lexer.source, lexer.file);
      return;
    }

    const range = ShaderLab.createRange(start, end);
    const expanded = this._expandMacroChunk(chunk, range, pathToken.lexeme);
    this._addContentReplace(pathToken.lexeme, start, end, expanded.content, undefined, expanded.sourceMap);
  }

  private static _parseIfDirective(lexer: PpLexer, directiveType: PpKeyword): void {
    const directiveLength = directiveType === PpKeyword.if ? 3 : directiveType === PpKeyword.ifdef ? 6 : 7; // #if = 3,  #ifdef = 6, #ifndef = 7
    const start = lexer.currentIndex - directiveLength;

    let shouldInclude: PpConstant;
    if (directiveType === PpKeyword.if) {
      shouldInclude = this._parseConstantExpression(lexer);
    } else {
      const macroToken = lexer.scanWord();
      this._branchMacros.add(macroToken.lexeme);
      const defined = this._definedMacros.get(macroToken.lexeme);
      shouldInclude = directiveType === PpKeyword.ifdef ? !!defined : !defined;
    }

    lexer.skipSpace(true);
    const { body, nextDirective } = lexer.scanMacroBranchBody();

    if (shouldInclude) {
      const end = nextDirective.type === PpKeyword.endif ? lexer.getShaderPosition(0) : lexer.scanRemainMacro();
      const expanded = this._expandMacroChunk(body.lexeme, body.location, lexer);
      this._addContentReplace(
        lexer.file,
        ShaderLab.createPosition(start),
        end,
        expanded.content,
        lexer.blockRange,
        expanded.sourceMap
      );
    } else {
      this._addEmptyReplace(lexer, start);
      this._processConditionalDirective(nextDirective.type, lexer);
    }
  }

  private static _processConditionalDirective(
    directive: PpKeyword.elif | PpKeyword.else | PpKeyword.endif,
    scanner: PpLexer
  ) {
    if (directive === PpKeyword.endif) {
      return;
    }

    const start = scanner.currentIndex;

    if (directive === PpKeyword.else) {
      const { body } = scanner.scanMacroBranchBody();
      const expanded = this._expandMacroChunk(body.lexeme, body.location, scanner);
      this._addContentReplace(
        scanner.file,
        ShaderLab.createPosition(start),
        scanner.getShaderPosition(0),
        expanded.content,
        scanner.blockRange,
        expanded.sourceMap
      );
    } else if (directive === PpKeyword.elif) {
      const constantExpr = this._parseConstantExpression(scanner);
      const { body, nextDirective } = scanner.scanMacroBranchBody();
      if (constantExpr) {
        const end = nextDirective.type === PpKeyword.endif ? scanner.currentIndex : scanner.scanRemainMacro().index;
        const expanded = this._expandMacroChunk(body.lexeme, body.location, scanner);
        this._addContentReplace(
          scanner.file,
          ShaderLab.createPosition(start),
          ShaderLab.createPosition(end),
          expanded.content,
          scanner.blockRange,
          expanded.sourceMap
        );
      } else {
        this._addContentReplace(
          scanner.file,
          ShaderLab.createPosition(start),
          ShaderLab.createPosition(scanner.currentIndex),
          "",
          scanner.blockRange
        );
        this._processConditionalDirective(nextDirective.type, scanner);
      }
    }
  }

  private static _parseConstantExpression(scanner: PpLexer): PpConstant {
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
      if (id.type === PpKeyword.defined) {
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

  private static _parseMacroFunctionArgs(
    source: string,
    startIndex: number,
    macroName: string
  ): { args: string[]; endIndex: number } {
    const length = source.length;
    let i = startIndex + macroName.length;

    // Find opening parenthesis
    while (i < length && source.charCodeAt(i) !== 40) i++;

    // Parse function arguments
    const args: string[] = [];
    let level = 1;
    let argStart = i + 1;
    let k = argStart;

    while (k < length && level > 0) {
      const charCode = source.charCodeAt(k);
      if (charCode === 40) {
        level++;
      } else if (charCode === 41) {
        if (--level === 0) {
          args.push(source.substring(argStart, k));
          break;
        }
      } else if (charCode === 44 && level === 1) {
        args.push(source.substring(argStart, k));
        argStart = k + 1;
      }
      k++;
    }

    return { args, endIndex: k + 1 };
  }

  private static _expandMacroBody(body: string): string {
    const visitedMacros = this._expandVisitedMacros;
    const currentVersionId = ++this._expandVersionId;
    let expandedBody = body;
    let hasExpansion = true;

    while (hasExpansion) {
      hasExpansion = false;
      const length = expandedBody.length;
      let i = 0;

      while (i < length) {
        const charCode = expandedBody.charCodeAt(i);
        if (!BaseLexer.isAlpha(charCode)) {
          i++;
          continue;
        }

        const start = i;
        while (i < length && BaseLexer.isAlnum(expandedBody.charCodeAt(i))) {
          i++;
        }

        const macroName = expandedBody.substring(start, i);
        const macro = this._definedMacros.get(macroName);

        if (!macro || visitedMacros[macroName] === currentVersionId) {
          continue;
        }

        // Prevent circular references
        visitedMacros[macroName] = currentVersionId;

        let replacement: string;
        let endIndex: number;

        if (!macro.isFunction) {
          replacement = macro.body?.lexeme ?? "";
          endIndex = i;
        } else {
          const { args, endIndex: newEndIndex } = this._parseMacroFunctionArgs(expandedBody, start, macroName);
          replacement = macro.expandFunctionBody(args);
          endIndex = newEndIndex;
        }

        expandedBody = expandedBody.substring(0, start) + replacement + expandedBody.substring(endIndex);
        hasExpansion = true;
        break;
      }
    }

    return expandedBody;
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

  private static _addEmptyReplace(lexer: PpLexer, start: number) {
    this._addContentReplace(
      lexer.file,
      ShaderLab.createPosition(start),
      lexer.getShaderPosition(0),
      "",
      lexer.blockRange
    );
  }

  private static _addContentReplace(
    sourceFile: string,
    start: ShaderPosition,
    end: ShaderPosition,
    content: string,
    sourceRange?: ShaderRange,
    sourceMap?: PpSourceMap
  ): void {
    // #if _VERBOSE
    const block = new BlockInfo(sourceFile, sourceRange, sourceMap);
    // #endif

    const range = ShaderLab.createRange(start, end);
    this._getExpandSegments().push({
      // #if _VERBOSE
      block,
      // #endif
      rangeInBlock: range,
      replace: content
    });
  }

  private static _parseDefine(lexer: PpLexer): void {
    const start = lexer.getShaderPosition(7);
    const macroName = lexer.scanWord();

    const { lexeme, location } = macroName;
    let { end } = location;
    if (this._definedMacros.get(lexeme) && lexeme.startsWith("GL_")) {
      this._reportError(location, `Redefined macro: ${lexeme}`, lexer.source, lexer.file);
    }

    let macroArgs: BaseToken[] | undefined;
    if (lexer.getCurChar() === "(") {
      macroArgs = lexer.scanWordsUntilTerminator(")");
      end = lexer.getShaderPosition(0);
    }
    const macroBody = lexer.scanMacroBody();
    const range = ShaderLab.createRange(start, end);
    const macroDefine = new MacroDefine(macroName, macroBody, range, macroArgs);
    this._definedMacros.set(lexeme, macroDefine);

    this._addContentReplace(lexer.file, start, lexer.getShaderPosition(0), "", lexer.blockRange);
  }

  private static _parseUndef(lexer: PpLexer): void {
    const start = lexer.getShaderPosition(6);
    const macroName = lexer.scanWord();
    this._definedMacros.delete(macroName.lexeme);

    this._addContentReplace(lexer.file, start, lexer.getShaderPosition(0), "", lexer.blockRange);
  }

  private static _parseMacro(lexer: PpLexer, token: BaseToken) {
    const macro = this._definedMacros.get(token.lexeme);
    if (macro) {
      const { location } = token;
      if (macro.isFunction) {
        const { args, endIndex } = this._parseMacroFunctionArgs(lexer.source, location.start.index, token.lexeme);
        const macroBodyExpanded = macro.expandFunctionBody(args);
        const expandedContent = this._expandMacroBody(macroBodyExpanded);

        const remainingLength = endIndex - location.end.index;
        lexer.advance(remainingLength);

        this._addContentReplace(
          lexer.file,
          location.start,
          lexer.getShaderPosition(0),
          expandedContent,
          lexer.blockRange
        );
      } else {
        const macroContent = macro.body?.lexeme ?? "";
        const expandedContent = this._expandMacroBody(macroContent);

        this._addContentReplace(lexer.file, location.start, location.end, expandedContent, lexer.blockRange);
      }
    }
  }

  // #if _VERBOSE
  static convertSourceIndex(index: number) {
    return this.lexer.sourceMap.map(index);
  }
  // #endif
}
