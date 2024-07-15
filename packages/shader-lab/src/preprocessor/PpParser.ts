import { ShaderRange } from "../common";
import LexerUtils from "../lexer/Utils";
import { MacroDefine } from "./MacroDefine";
// #if _EDITOR
import PpSourceMap, { BlockInfo } from "./sourceMap";
// #endif
import { BaseToken } from "../common/BaseToken";
import { ParserUtils } from "../Utils";
import { EPpKeyword, EPpToken, PpConstant } from "./constants";
import PpScanner from "./PpScanner";
import { PpUtils } from "./Utils";
import { ShaderLab } from "../ShaderLab";

export interface ExpandSegment {
  // #if _EDITOR
  block?: BlockInfo;
  // #endif
  rangeInBlock: ShaderRange;
  replace: string;
}

/** @internal */
export default class PpParser {
  private static definedMacros: Map<string, MacroDefine> = new Map();
  private static expandSegmentsStack: ExpandSegment[][] = [[]];

  /** Referenced by branch macro or defined operator */
  private static branchMacros: Set<string> = new Set();

  private static includeMap: Record<string, string>;

  static reset(includeMap: Record<string, string>) {
    this.definedMacros.clear();
    this.expandSegmentsStack.length = 0;
    this.expandSegmentsStack.push([]);
    this.branchMacros.clear();
    this.addPredefinedMacro("GL_ES");
    this.includeMap = includeMap;
  }

  static addPredefinedMacro(macro: string, value?: string) {
    const tk = BaseToken.pool.get();
    tk.set(EPpToken.id, macro);

    let macroBody: BaseToken | undefined;
    if (value) {
      macroBody = BaseToken.pool.get();
      macroBody.set(EPpToken.id, value);
    }

    this.definedMacros.set(macro, new MacroDefine(tk, macroBody));
  }

  static parse(scanner: PpScanner): string {
    while (!scanner.isEnd()) {
      const directive = scanner.scanDirective(this.onToken.bind(this))!;
      if (scanner.isEnd()) break;
      switch (directive.type) {
        case EPpKeyword.define:
          this.parseDefine(scanner);
          break;

        case EPpKeyword.undef:
          this.parseUndef(scanner);
          break;

        case EPpKeyword.if:
          this.parseIf(scanner);
          break;

        case EPpKeyword.ifndef:
          this.parseIfNdef(scanner);
          break;

        case EPpKeyword.ifdef:
          this.parseIfDef(scanner);
          break;

        case EPpKeyword.include:
          this.parseInclude(scanner);
          break;
      }
    }

    return PpUtils.expand(this.expandSegments, scanner.source, scanner.sourceMap);
  }

  private static get expandSegments() {
    return this.expandSegmentsStack[this.expandSegmentsStack.length - 1];
  }

  private static parseInclude(scanner: PpScanner) {
    const start = scanner.getShaderPosition(8);

    scanner.skipSpace(true);
    const id = scanner.scanQuotedString();
    scanner.scanToChar("\n");
    const end = scanner.getShaderPosition();

    const chunk = this.includeMap[id.lexeme];
    if (!chunk) {
      ParserUtils.throw(id.location, `Shader slice "${id.lexeme}" not founded.`);
    }

    const range = ShaderLab.createRange(start, end);
    const expanded = this.expandMacroChunk(chunk, range, id.lexeme);
    // #if _EDITOR
    const block = new BlockInfo(id.lexeme, undefined, expanded.sourceMap);
    // #endif
    this.expandSegments.push({
      // #if _EDITOR
      block,
      // #endif
      rangeInBlock: range,
      replace: expanded.content
    });
  }

  private static parseIfDef(scanner: PpScanner) {
    const start = scanner.current - 6;

    const id = scanner.scanWord();
    this.addEmptyReplace(scanner, start);
    this.branchMacros.add(id.lexeme);

    const macro = this.definedMacros.get(id.lexeme);
    scanner.skipSpace(true);

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition() : scanner.scanRemainMacro();

      const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);

      // #if _EDITOR
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);

      this.expandSegments.push({
        // #if _EDITOR
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });

      return;
    }

    this.expandSegments.pop();
    this.addEmptyReplace(scanner, start);

    this.parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private static parseMacroBranch(directive: EPpKeyword.elif | EPpKeyword.else | EPpKeyword.endif, scanner: PpScanner) {
    if (directive === EPpKeyword.endif) {
      return;
    }

    const start = scanner.current;

    if (directive === EPpKeyword.else) {
      const { token: elseChunk } = scanner.scanMacroBranchChunk();
      const expanded = this.expandMacroChunk(elseChunk.lexeme, elseChunk.location, scanner);
      // #if _EDITOR
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const startPosition = ShaderLab.createPosition(start);
      const range = ShaderLab.createRange(startPosition, scanner.getShaderPosition());
      this.expandSegments.push({
        // #if _EDITOR
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
    } else if (directive === EPpKeyword.elif) {
      const constantExpr = this.parseConstantExpression(scanner);
      const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
      if (!!constantExpr) {
        const end = nextDirective.type === EPpKeyword.endif ? scanner.current : scanner.scanRemainMacro().index;
        const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
        // #if _EDITOR
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const startPosition = ShaderLab.createPosition(start);
        const endPosition = ShaderLab.createPosition(end);
        const range = ShaderLab.createRange(startPosition, endPosition);
        this.expandSegments.push({
          // #if _EDITOR
          block,
          // #endif
          rangeInBlock: range,
          replace: expanded.content
        });
      } else {
        // #if _EDITOR
        const block = new BlockInfo(scanner.file, scanner.blockRange);
        // #endif
        const startPosition = ShaderLab.createPosition(start);
        const endPosition = ShaderLab.createPosition(scanner.current);
        const range = ShaderLab.createRange(startPosition, endPosition);
        this.expandSegments.push({
          // #if _EDITOR
          block,
          // #endif
          rangeInBlock: range,
          replace: ""
        });
        this.parseMacroBranch(<any>nextDirective.type, scanner);
      }
    }
  }

  private static parseConstantExpression(scanner: PpScanner) {
    scanner.skipSpace(true);
    return this.parseLogicalOrExpression(scanner);
  }

  private static parseLogicalOrExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseLogicalAndExpression(scanner);
    const operator = scanner.peek(2);
    if (operator && operator === "||") {
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this.parseLogicalOrExpression(scanner);
      return operand1 || operand2;
    }
    return operand1;
  }

  private static parseLogicalAndExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseEqualityExpression(scanner);
    const operator = scanner.peek(2);
    if (operator && operator === "&&") {
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this.parseLogicalAndExpression(scanner);
      return operand1 && operand2;
    }
    return operand1;
  }

  private static parseEqualityExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseRelationalExpression(scanner);
    const operator = scanner.peek(2);
    if (operator && ["==", "!="].includes(operator)) {
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this.parseEqualityExpression(scanner);
      switch (operator) {
        case "==":
          return operand1 === operand2;
        case "!=":
          return operand1 !== operand2;
      }
    }
    return operand1;
  }

  private static parseRelationalExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseShiftExpression(scanner) as number;
    let operator = scanner.peek(2);
    if (operator[1] !== "=") operator = operator[0];
    if (operator && [">", "<", ">=", "<="].includes(operator)) {
      const opPos = scanner.getShaderPosition();
      scanner.advance(operator.length);
      scanner.skipSpace(false);
      const operand2 = this.parseRelationalExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        ParserUtils.throw(opPos, "invalid operator in relation expression.");
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

  private static parseShiftExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseAdditiveExpression(scanner) as number;
    const operator = scanner.peek(2);
    if (operator && [">>", "<<"].includes(operator)) {
      const opPos = scanner.getShaderPosition();
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this.parseShiftExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        ParserUtils.throw(opPos, "invalid operator in shift expression.");
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

  private static parseAdditiveExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseMulticativeExpression(scanner) as number;
    if ([">", "<"].includes(scanner.getCurChar())) {
      const opPos = scanner.getShaderPosition();
      scanner.advance();

      const operator = scanner.getCurChar();
      scanner.skipSpace(false);
      const operand2 = this.parseAdditiveExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        ParserUtils.throw(opPos, "invalid operator.");
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

  private static parseMulticativeExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseUnaryExpression(scanner) as number;
    scanner.skipSpace(false);
    if (["*", "/", "%"].includes(scanner.getCurChar())) {
      const opPos = scanner.getShaderPosition();
      const operator = scanner.getCurChar();
      scanner.skipSpace(false);
      const operand2 = this.parseMulticativeExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        ParserUtils.throw(opPos, "invalid operator.");
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

  private static parseUnaryExpression(scanner: PpScanner) {
    const operator = scanner.getCurChar();
    if (["+", "-", "!"].includes(operator)) {
      scanner.advance();
      const opPos = scanner.getShaderPosition();
      const parenExpr = this.parseParenthesisExpression(scanner);
      if ((operator === "!" && typeof parenExpr !== "boolean") || (operator !== "!" && typeof parenExpr !== "number")) {
        ParserUtils.throw(opPos, "invalid operator.");
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
    return this.parseParenthesisExpression(scanner);
  }

  private static parseParenthesisExpression(scanner: PpScanner): PpConstant {
    if (scanner.getCurChar() === "(") {
      scanner.advance();
      scanner.skipSpace(false);
      const ret = this.parseConstant(scanner);
      scanner.scanToChar(")");
      scanner.advance();
      return ret;
    }
    return this.parseConstant(scanner);
  }

  private static parseConstant(scanner: PpScanner): PpConstant {
    if (LexerUtils.isAlpha(scanner.getCurChar())) {
      const id = scanner.scanWord();
      if (id.type === EPpKeyword.defined) {
        const withParen = scanner.peekNonSpace() === "(";
        const macro = scanner.scanWord(true);
        if (withParen) {
          scanner.scanToChar(")");
          scanner.advance();
        }
        this.branchMacros.add(macro.lexeme);
        return !!this.definedMacros.get(macro.lexeme);
      } else {
        const macro = this.definedMacros.get(id.lexeme);
        if (!macro) {
          // ParserUtils.throw(id.location, 'undefined macro:', id.lexeme);
          return false;
        }
        if (macro.isFunction) {
          ParserUtils.throw(id.location, "invalid function macro usage");
        }
        const value = Number(macro.body.lexeme);
        if (!Number.isInteger(value)) {
          ParserUtils.throw(id.location, "invalid const macro:", id.lexeme);
        }
        this.branchMacros.add(id.lexeme);
        return value;
      }
    } else if (LexerUtils.isNum(scanner.getCurChar())) {
      const integer = scanner.scanInteger();
      return Number(integer.lexeme);
    } else {
      ParserUtils.throw(scanner.getShaderPosition(), "invalid token", scanner.getCurChar());
    }
  }

  /**
   * Recursively expand macro body and expansion.
   */
  private static expandMacroChunk(
    chunk: string,
    loc: ShaderRange,
    parentScanner: PpScanner
  ): {
    content: string;
    // #if _EDITOR
    sourceMap: PpSourceMap;
    // #endif
  };
  private static expandMacroChunk(
    chunk: string,
    loc: ShaderRange,
    file: string
  ): {
    content: string;
    // #if _EDITOR
    sourceMap: PpSourceMap;
    // #endif
  };
  private static expandMacroChunk(
    chunk: string,
    loc: ShaderRange,
    scannerOrFile: PpScanner | string
  ): {
    content: string;
    // #if _EDITOR
    sourceMap: PpSourceMap;
    // #endif
  } {
    this.expandSegmentsStack.push([]);
    let scanner: PpScanner;
    if (typeof scannerOrFile === "string") {
      scanner = new PpScanner(chunk, scannerOrFile);
    } else {
      scanner = new PpScanner(chunk, scannerOrFile.file, loc);
    }
    const ret = this.parse(scanner);
    this.expandSegmentsStack.pop();
    return {
      content: ret,
      // #if _EDITOR
      sourceMap: scanner.sourceMap
      // #endif
    };
  }

  private static parseIfNdef(scanner: PpScanner) {
    const start = scanner.current - 7;

    const id = scanner.scanWord();
    this.addEmptyReplace(scanner, start);
    this.branchMacros.add(id.lexeme);

    const macro = this.definedMacros.get(id.lexeme);
    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition() : scanner.scanRemainMacro();

      const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _EDITOR
      const blockInfo = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);
      this.expandSegments.push({
        // #if _EDITOR
        block: blockInfo,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
      return;
    }

    this.expandSegments.pop();
    this.addEmptyReplace(scanner, start);
    this.parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private static addEmptyReplace(scanner: PpScanner, start: number) {
    // #if _EDITOR
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    const startPosition = ShaderLab.createPosition(start);
    const endPosition = scanner.curPosition;
    const range = ShaderLab.createRange(startPosition, endPosition);
    this.expandSegments.push({
      // #if _EDITOR
      block,
      // #endif
      rangeInBlock: range,
      replace: ""
    });
  }

  private static parseIf(scanner: PpScanner) {
    const start = scanner.current - 3;

    const constantExpr = this.parseConstantExpression(scanner);
    this.addEmptyReplace(scanner, start);

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!!constantExpr) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getShaderPosition() : scanner.scanRemainMacro();
      const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _EDITOR
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      const range = ShaderLab.createRange(bodyChunk.location.start, end);
      this.expandSegments.push({
        // #if _EDITOR
        block,
        // #endif
        rangeInBlock: range,
        replace: expanded.content
      });
      return;
    }

    this.expandSegments.pop();
    this.addEmptyReplace(scanner, start);
    this.parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private static parseDefine(scanner: PpScanner) {
    const start = scanner.getShaderPosition(7);
    const macro = scanner.scanWord();

    let end = macro.location.end;
    if (this.definedMacros.get(macro.lexeme) && macro.lexeme.startsWith("GL_")) {
      ParserUtils.throw(macro.location, "redefined macro:", macro.lexeme);
    }

    let macroArgs: BaseToken[] | undefined;
    if (scanner.getCurChar() === "(") {
      macroArgs = scanner.scanWordsUntilChar(")");
      end = scanner.getShaderPosition();
    }
    const macroBody = scanner.scanLineRemain();
    const range = ShaderLab.createRange(start, end);
    const macroDefine = new MacroDefine(macro, macroBody, range, macroArgs);
    this.definedMacros.set(macro.lexeme, macroDefine);

    // #if _EDITOR
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif

    this.expandSegments.push({
      // #if _EDITOR
      block,
      // #endif
      rangeInBlock: ShaderLab.createRange(start, scanner.curPosition),
      replace: ""
    });
  }

  private static parseUndef(scanner: PpScanner) {
    const start = scanner.current - 6;
    const macro = scanner.scanWord();

    // #if _EDITOR
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    const startPosition = ShaderLab.createPosition(start);
    const range = ShaderLab.createRange(startPosition, scanner.curPosition);
    this.expandSegments.push({
      // #if _EDITOR
      block,
      // #endif
      rangeInBlock: range,
      replace: ""
    });
    this.definedMacros.delete(macro.lexeme);
  }

  private static onToken(token: BaseToken, scanner: PpScanner) {
    // #if !_EDITOR
    this.skipEditorBlock(token, scanner);
    // #endif
    this.expandToken(token, scanner);
  }

  private static skipEditorBlock(token: BaseToken, scanner: PpScanner) {
    if (token.lexeme === "EditorProperties" || token.lexeme === "EditorMacros") {
      const start = scanner.current - token.lexeme.length;
      scanner.scanPairedBlock();
      const end = scanner.current;
      const startPosition = ShaderLab.createPosition(start);
      const endPosition = ShaderLab.createPosition(end);
      const range = ShaderLab.createRange(startPosition, endPosition);
      this.expandSegments.push({ rangeInBlock: range, replace: "" });
    }
  }

  private static expandToken(token: BaseToken, scanner: PpScanner) {
    const macro = this.definedMacros.get(token.lexeme);
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
        const range = ShaderLab.createRange(token.location!.start, scanner.curPosition);
        replace = macro.expand(...args);
        const expanded = this.expandMacroChunk(replace, range, scanner);
        // #if _EDITOR
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const blockRange = ShaderLab.createRange(token.location!.start, scanner.curPosition);
        this.expandSegments.push({
          // #if _EDITOR
          block,
          // #endif
          rangeInBlock: blockRange,
          replace: expanded.content
        });
      } else {
        const expanded = this.expandMacroChunk(replace, token.location, scanner);
        // #if _EDITOR
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        const range = ShaderLab.createRange(token.location.start, token.location.end);
        this.expandSegments.push({
          // #if _EDITOR
          block,
          // #endif
          rangeInBlock: range,
          replace: expanded.content
        });
      }
    }
  }
}
