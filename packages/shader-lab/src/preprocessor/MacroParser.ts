import { ShaderMacro } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from "../common";
import { BaseToken } from "../common/BaseToken";
import { GSErrorName } from "../GSError";
import { ShaderLab } from "../ShaderLab";
import { ShaderLabUtils } from "../ShaderLabUtils";
import { MacroParserConstant, MacroParserKeyword, MacroParserToken } from "./constants";
import { MacroDefine } from "./MacroDefine";
import MacroParserLexer from "./MacroParserLexer";
import { PpUtils } from "./Utils";
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
export class MacroParser {
  static lexer: MacroParserLexer;

  private static _definedMacros: Map<string, MacroDefine> = new Map();
  private static _expandSegmentsStack: ExpandSegment[][] = [[]];

  private static _expandVisitedMacros: Record<string, number> = {};
  private static _expandVersionId: number = 1;

  // #if _VERBOSE
  static _errors: Error[] = [];
  // #endif

  static parse(source: string, macros: ShaderMacro[]): string | null {
    MacroParser._reset();

    for (const macro of macros) {
      MacroParser._addPredefinedMacro(macro.name, macro.value);
    }

    this.lexer = new MacroParserLexer(source);
    return MacroParser._parseDirectives(this.lexer);
  }

  private static _reset() {
    this._expandSegmentsStack.length = 0;
    this._expandSegmentsStack.push([]);

    this._definedMacros.clear();
    this._addPredefinedMacro("GL_ES");

    // #if _VERBOSE
    this._errors.length = 0;
    // #endif
  }

  private static _addPredefinedMacro(macro: string, value?: string) {
    const token = BaseToken.pool.get();
    token.set(MacroParserToken.id, macro);

    let macroBody: BaseToken | undefined;
    if (value != undefined) {
      macroBody = BaseToken.pool.get();
      macroBody.set(MacroParserToken.id, value);
    }

    this._definedMacros.set(macro, new MacroDefine(token, macroBody));
  }

  private static _parseDirectives(lexer: MacroParserLexer): string | null {
    let directive: BaseToken | undefined;
    while ((directive = lexer.scanToken())) {
      switch (directive.type) {
        case MacroParserToken.id:
          this._parseMacro(lexer, directive);
          break;
        case MacroParserKeyword.define:
          this._parseDefine(lexer);
          break;
        case MacroParserKeyword.undef:
          this._parseUndef(lexer);
          break;
        case MacroParserKeyword.if:
          this._parseIfDirective(lexer, MacroParserKeyword.if);
          break;
        case MacroParserKeyword.ifndef:
          this._parseIfDirective(lexer, MacroParserKeyword.ifndef);
          break;
        case MacroParserKeyword.ifdef:
          this._parseIfDirective(lexer, MacroParserKeyword.ifdef);
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

  private static _reportError(loc: ShaderRange | ShaderPosition, message: string, source: string, file?: string) {
    const error = ShaderLabUtils.createGSError(message, GSErrorName.PreprocessorError, source, loc, file);
    // #if _VERBOSE
    this._errors.push(error);
    // #endif
  }

  private static _parseIfDirective(lexer: MacroParserLexer, directiveType: MacroParserKeyword): void {
    const directiveLength =
      directiveType === MacroParserKeyword.if ? 3 : directiveType === MacroParserKeyword.ifdef ? 6 : 7; // #if = 3,  #ifdef = 6, #ifndef = 7
    const start = lexer.currentIndex - directiveLength;
    let skipMacro = false;

    let shouldInclude: MacroParserConstant;
    if (directiveType === MacroParserKeyword.if) {
      shouldInclude = this._parseConstantExpression(lexer);
    } else {
      const macroToken = lexer.scanWord();
      const lexeme = macroToken.lexeme;
      if (lexeme.startsWith("GL_")) {
        skipMacro = true;
      } else {
        const defined = this._definedMacros.get(lexeme);
        shouldInclude = directiveType === MacroParserKeyword.ifdef ? !!defined : !defined;
      }
    }

    lexer.skipSpace(true);
    const { body, nextDirective } = lexer.scanMacroBranchBody();

    if (skipMacro) return;

    if (shouldInclude) {
      const end =
        nextDirective.type === MacroParserKeyword.endif ? lexer.getShaderPosition(0) : lexer.scanRemainMacro();
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
    directive: MacroParserKeyword.elif | MacroParserKeyword.else | MacroParserKeyword.endif,
    scanner: MacroParserLexer
  ) {
    if (directive === MacroParserKeyword.endif) {
      return;
    }

    const start = scanner.currentIndex;

    if (directive === MacroParserKeyword.else) {
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
    } else if (directive === MacroParserKeyword.elif) {
      const constantExpr = this._parseConstantExpression(scanner);
      const { body, nextDirective } = scanner.scanMacroBranchBody();
      if (constantExpr) {
        const end =
          nextDirective.type === MacroParserKeyword.endif ? scanner.currentIndex : scanner.scanRemainMacro().index;
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

  private static _parseConstantExpression(scanner: MacroParserLexer): MacroParserConstant {
    scanner.skipSpace(true);
    return this._parseLogicalOrExpression(scanner);
  }

  private static _parseLogicalOrExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseLogicalAndExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseEqualityExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseRelationalExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseShiftExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseAdditiveExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseMulticativeExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseUnaryExpression(scanner: MacroParserLexer) {
    const operator = scanner.getCurChar();
    if (["+", "-", "!"].includes(operator)) {
      const opPos = scanner.getShaderPosition(0);
      scanner.advance(1);
      scanner.skipSpace(false);
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

  private static _parseParenthesisExpression(scanner: MacroParserLexer): MacroParserConstant {
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

  private static _parseConstant(scanner: MacroParserLexer): MacroParserConstant {
    if (BaseLexer.isAlpha(scanner.getCurCharCode())) {
      const id = scanner.scanWord();
      if (id.type === MacroParserKeyword.defined) {
        const withParen = scanner.peekNonSpace() === "(";
        const macro = scanner.scanWord();
        if (withParen) {
          scanner.scanToChar(")");
          scanner.advance(1);
        }
        return !!this._definedMacros.get(macro.lexeme);
      } else {
        const macro = this._definedMacros.get(id.lexeme);

        if (!macro) {
          return false;
        }

        if (!macro.body) {
          return true;
        }

        if (macro.isFunction) {
          this._reportError(id.location, "invalid function macro usage", scanner.source, scanner.file);
        }
        const value = Number(macro.body.lexeme);
        if (!Number.isInteger(value)) {
          this._reportError(id.location, `invalid const macro: ${id.lexeme}`, scanner.source, scanner.file);
        }
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
          const arg = source.substring(argStart, k).trim();
          if (arg.length > 0) args.push(arg);
          break;
        }
      } else if (charCode === 44 && level === 1) {
        const arg = source.substring(argStart, k).trim();
        if (arg.length > 0) args.push(arg);
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
    parentScanner: MacroParserLexer
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
    scannerOrFile: MacroParserLexer | string
  ): {
    content: string;
    // #if _VERBOSE
    sourceMap: PpSourceMap;
    // #endif
  } {
    this._expandSegmentsStack.push([]);
    let scanner: MacroParserLexer;
    if (typeof scannerOrFile === "string") {
      scanner = new MacroParserLexer(chunk, scannerOrFile);
    } else {
      scanner = new MacroParserLexer(chunk, scannerOrFile.file, loc);
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

  private static _addEmptyReplace(lexer: MacroParserLexer, start: number) {
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

  private static _parseDefine(lexer: MacroParserLexer): void {
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

  private static _parseUndef(lexer: MacroParserLexer): void {
    const start = lexer.getShaderPosition(6);
    const macroName = lexer.scanWord();
    this._definedMacros.delete(macroName.lexeme);

    this._addContentReplace(lexer.file, start, lexer.getShaderPosition(0), "", lexer.blockRange);
  }

  private static _parseMacro(lexer: MacroParserLexer, token: BaseToken) {
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
