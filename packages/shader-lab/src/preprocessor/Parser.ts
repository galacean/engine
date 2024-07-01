import LexerUtils from "../lexer/Utils";
import LocRange from "../common/LocRange";
import { MacroDefine } from "./MacroDefine";
import { PpError } from "./PpError";
// #if _DEVELOPMENT
import PpSourceMap, { BlockInfo } from "./sourceMap";
// #endif
import PpToken from "./PpToken";
import PpScanner from "./Scanner";
import { PpUtils } from "./Utils";
import { EPpKeyword, EPpToken, PpConstant } from "./constants";
import { IIndexRange } from "./IndexRange";

export interface ExpandSegment {
  // #if _DEVELOPMENT
  block?: BlockInfo;
  // #endif
  rangeInBlock: IIndexRange;
  replace: string;
}

export default class PpParser extends PpError {
  private definedMacros: Map<string, MacroDefine> = new Map();
  private expandSegmentsStack: ExpandSegment[][] = [[]];

  /** Referenced by branch macro or defined operator */
  branchMacros: Set<string> = new Set();

  readonly includeMap: Record<string, string>;

  private get expandSegments() {
    return this.expandSegmentsStack[this.expandSegmentsStack.length - 1];
  }

  constructor(includeMap: Record<string, string>) {
    super();
    this.addPredefinedMacro("GL_ES");
    this.includeMap = includeMap;
  }

  addPredefinedMacro(macro: string, value?: string) {
    const tk = new PpToken(EPpToken.id, macro);
    const macroBody = value ? new PpToken(EPpToken.id, value) : undefined;
    this.definedMacros.set(macro, new MacroDefine(tk, macroBody));
  }

  parse(scanner: PpScanner): string {
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

  private parseInclude(scanner: PpScanner) {
    const start = scanner.getPosition(8);

    scanner.skipSpace();
    const id = scanner.scanQuotedString();
    scanner.scanToChar("\n");
    const end = scanner.getPosition();

    const chunk = this.includeMap[id.lexeme];
    if (!chunk) {
      this.throw(id.location, `Shader slice "${id.lexeme}" not founded.`);
    }

    const expanded = this.expandMacroChunk(chunk, { start, end }, id.lexeme);
    // #if _DEVELOPMENT
    const block = new BlockInfo(id.lexeme, undefined, expanded.sourceMap);
    // #endif
    this.expandSegments.push({
      // #if _DEVELOPMENT
      block,
      // #endif
      rangeInBlock: { start, end },
      replace: expanded.content
    });
  }

  private parseIfDef(scanner: PpScanner) {
    const start = scanner.current - 6;

    const id = scanner.scanWord();
    this.addEmptyReplace(scanner, start);
    this.branchMacros.add(id.lexeme);

    const macro = this.definedMacros.get(id.lexeme);
    scanner.skipSpace();

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getPosition() : scanner.scanRemainMacro();

      const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);

      // #if _DEVELOPMENT
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif

      this.expandSegments.push({
        // #if _DEVELOPMENT
        block,
        // #endif
        rangeInBlock: { start: bodyChunk.location.start, end },
        replace: expanded.content
      });

      return;
    }

    this.expandSegments.pop();
    this.addEmptyReplace(scanner, start);

    this.parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private parseMacroBranch(directive: EPpKeyword.elif | EPpKeyword.else | EPpKeyword.endif, scanner: PpScanner) {
    if (directive === EPpKeyword.endif) {
      return;
    }

    const start = scanner.current;

    if (directive === EPpKeyword.else) {
      const { token: elseChunk } = scanner.scanMacroBranchChunk();
      const expanded = this.expandMacroChunk(elseChunk.lexeme, elseChunk.location, scanner);
      // #if _DEVELOPMENT
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      this.expandSegments.push({
        // #if _DEVELOPMENT
        block,
        // #endif
        rangeInBlock: { start: { index: start }, end: scanner.getPosition() },
        replace: expanded.content
      });
    } else if (directive === EPpKeyword.elif) {
      const constantExpr = this.parseConstantExpression(scanner);
      const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
      if (!!constantExpr) {
        const end = nextDirective.type === EPpKeyword.endif ? scanner.current : scanner.scanRemainMacro().index;
        const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
        // #if _DEVELOPMENT
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        this.expandSegments.push({
          // #if _DEVELOPMENT
          block,
          // #endif
          rangeInBlock: { start: { index: start }, end: { index: end } },
          replace: expanded.content
        });
      } else {
        // #if _DEVELOPMENT
        const block = new BlockInfo(scanner.file, scanner.blockRange);
        // #endif
        this.expandSegments.push({
          // #if _DEVELOPMENT
          block,
          // #endif
          rangeInBlock: { start: { index: start }, end: { index: scanner.current } },
          replace: ""
        });
        this.parseMacroBranch(<any>nextDirective.type, scanner);
      }
    }
  }

  private parseConstantExpression(scanner: PpScanner) {
    scanner.skipSpace();
    return this.parseLogicalOrExpression(scanner);
  }

  private parseLogicalOrExpression(scanner: PpScanner): PpConstant {
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

  private parseLogicalAndExpression(scanner: PpScanner): PpConstant {
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

  private parseEqualityExpression(scanner: PpScanner): PpConstant {
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

  private parseRelationalExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseShiftExpression(scanner) as number;
    let operator = scanner.peek(2);
    if (operator[1] !== "=") operator = operator[0];
    if (operator && [">", "<", ">=", "<="].includes(operator)) {
      const opPos = scanner.getPosition();
      scanner.advance(operator.length);
      scanner.skipSpace(false);
      const operand2 = this.parseRelationalExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.throw(opPos, "invalid operator in relation expression.");
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

  private parseShiftExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseAdditiveExpression(scanner) as number;
    const operator = scanner.peek(2);
    if (operator && [">>", "<<"].includes(operator)) {
      const opPos = scanner.getPosition();
      scanner.advance(2);
      scanner.skipSpace(false);
      const operand2 = this.parseShiftExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.throw(opPos, "invalid operator in shift expression.");
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

  private parseAdditiveExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseMulticativeExpression(scanner) as number;
    if ([">", "<"].includes(scanner.curChar())) {
      const opPos = scanner.getPosition();
      scanner.advance();

      const operator = scanner.curChar();
      scanner.skipSpace(false);
      const operand2 = this.parseAdditiveExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.throw(opPos, "invalid operator.");
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

  private parseMulticativeExpression(scanner: PpScanner): PpConstant {
    const operand1 = this.parseUnaryExpression(scanner) as number;
    scanner.skipSpace(false);
    if (["*", "/", "%"].includes(scanner.curChar())) {
      const opPos = scanner.getPosition();
      const operator = scanner.curChar();
      scanner.skipSpace(false);
      const operand2 = this.parseMulticativeExpression(scanner) as number;
      if (typeof operand1 !== typeof operand2 && typeof operand1 !== "number") {
        this.throw(opPos, "invalid operator.");
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

  private parseUnaryExpression(scanner: PpScanner) {
    const operator = scanner.curChar();
    if (["+", "-", "!"].includes(operator)) {
      scanner.advance();
      const opPos = scanner.getPosition();
      const parenExpr = this.parseParenthesisExpression(scanner);
      if ((operator === "!" && typeof parenExpr !== "boolean") || (operator !== "!" && typeof parenExpr !== "number")) {
        this.throw(opPos, "invalid operator.");
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

  private parseParenthesisExpression(scanner: PpScanner): PpConstant {
    if (scanner.curChar() === "(") {
      scanner.advance();
      scanner.skipSpace(false);
      const ret = this.parseConstant(scanner);
      scanner.scanToChar(")");
      scanner.advance();
      return ret;
    }
    return this.parseConstant(scanner);
  }

  private parseConstant(scanner: PpScanner): PpConstant {
    if (LexerUtils.isAlpha(scanner.curChar())) {
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
          // this.throw(id.location, 'undefined macro:', id.lexeme);
          return false;
        }
        if (macro.isFunction) {
          this.throw(id.location, "invalid function macro usage");
        }
        const value = Number(macro.body.lexeme);
        if (!Number.isInteger(value)) {
          this.throw(id.location, "invalid const macro:", id.lexeme);
        }
        this.branchMacros.add(id.lexeme);
        return value;
      }
    } else if (LexerUtils.isNum(scanner.curChar())) {
      const integer = scanner.scanInteger();
      return Number(integer.lexeme);
    } else {
      this.throw(scanner.getPosition(), "invalid token", scanner.curChar());
    }
  }

  /**
   * Recursively expand macro body and expansion.
   */
  private expandMacroChunk(
    chunk: string,
    loc: LocRange,
    parentScanner: PpScanner
  ): {
    content: string;
    // #if _DEVELOPMENT
    sourceMap: PpSourceMap;
    // #endif
  };
  private expandMacroChunk(
    chunk: string,
    loc: LocRange,
    file: string
  ): {
    content: string;
    // #if _DEVELOPMENT
    sourceMap: PpSourceMap;
    // #endif
  };
  private expandMacroChunk(
    chunk: string,
    loc: LocRange,
    scannerOrFile: PpScanner | string
  ): {
    content: string;
    // #if _DEVELOPMENT
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
      // #if _DEVELOPMENT
      sourceMap: scanner.sourceMap
      // #endif
    };
  }

  private parseIfNdef(scanner: PpScanner) {
    const start = scanner.current - 7;

    const id = scanner.scanWord();
    this.addEmptyReplace(scanner, start);
    this.branchMacros.add(id.lexeme);

    const macro = this.definedMacros.get(id.lexeme);
    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!macro) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getPosition() : scanner.scanRemainMacro();

      const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _DEVELOPMENT
      const blockInfo = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      this.expandSegments.push({
        // #if _DEVELOPMENT
        block: blockInfo,
        // #endif
        rangeInBlock: { start: bodyChunk.location.start, end },
        replace: expanded.content
      });
      return;
    }

    this.expandSegments.pop();
    this.addEmptyReplace(scanner, start);
    this.parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private addEmptyReplace(scanner: PpScanner, start: number) {
    // #if _DEVELOPMENT
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    this.expandSegments.push({
      // #if _DEVELOPMENT
      block,
      // #endif
      rangeInBlock: { start: { index: start }, end: { index: scanner.current } },
      replace: ""
    });
  }

  private parseIf(scanner: PpScanner) {
    const start = scanner.current - 3;

    const constantExpr = this.parseConstantExpression(scanner);
    this.addEmptyReplace(scanner, start);

    const { token: bodyChunk, nextDirective } = scanner.scanMacroBranchChunk();
    if (!!constantExpr) {
      const end = nextDirective.type === EPpKeyword.endif ? scanner.getPosition() : scanner.scanRemainMacro();
      const expanded = this.expandMacroChunk(bodyChunk.lexeme, bodyChunk.location, scanner);
      // #if _DEVELOPMENT
      const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
      // #endif
      this.expandSegments.push({
        // #if _DEVELOPMENT
        block,
        // #endif
        rangeInBlock: { start: bodyChunk.location.start, end },
        replace: expanded.content
      });
      return;
    }

    this.expandSegments.pop();
    this.addEmptyReplace(scanner, start);
    this.parseMacroBranch(<any>nextDirective.type, scanner);
  }

  private parseDefine(scanner: PpScanner) {
    const start = scanner.getPosition(7);
    const macro = scanner.scanWord();

    let end = macro.location.end;
    if (this.definedMacros.get(macro.lexeme) && macro.lexeme.startsWith("GL_")) {
      this.throw(macro.location, "redefined macro:", macro.lexeme);
    }

    let macroArgs: PpToken[] | undefined;
    if (scanner.curChar() === "(") {
      macroArgs = scanner.scanWordsUntilChar(")");
      end = scanner.getPosition();
    }
    const macroBody = scanner.scanLineRemain();
    const macroDefine = new MacroDefine(macro, macroBody, new LocRange(start, end), macroArgs);
    this.definedMacros.set(macro.lexeme, macroDefine);

    // #if _DEVELOPMENT
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    this.expandSegments.push({
      // #if _DEVELOPMENT
      block,
      // #endif
      rangeInBlock: { start, end: { index: scanner.current } },
      replace: ""
    });
  }

  private parseUndef(scanner: PpScanner) {
    const start = scanner.current - 6;
    const macro = scanner.scanWord();

    // #if _DEVELOPMENT
    const block = new BlockInfo(scanner.file, scanner.blockRange);
    // #endif
    this.expandSegments.push({
      // #if _DEVELOPMENT
      block,
      // #endif
      rangeInBlock: { start: { index: start }, end: { index: scanner.current } },
      replace: ""
    });
    this.definedMacros.delete(macro.lexeme);
  }

  private onToken(token: PpToken, scanner: PpScanner) {
    // #if !_DEVELOPMENTMENT
    this.skipEditorBlock(token, scanner);
    // #endif
    this.expandToken(token, scanner);
  }

  private skipEditorBlock(token: PpToken, scanner: PpScanner) {
    if (token.lexeme === "EditorProperties" || token.lexeme === "EditorMacros") {
      const start = scanner.current - token.length;
      scanner.scanPairedBlock();
      const end = scanner.current;
      this.expandSegments.push({ rangeInBlock: { start: { index: start }, end: { index: end } }, replace: "" });
    }
  }

  private expandToken(token: PpToken, scanner: PpScanner) {
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
          if (scanner.curChar() === "(") curLvl += 1;
          else if (scanner.curChar() === ")") {
            curLvl -= 1;
            if (curLvl === 0) break;
          } else if (scanner.curChar() === "," && curLvl === 1) {
            args.push(scanner.source.slice(curIdx, scanner.current));
            curIdx = scanner.current + 1;
          }
          scanner.advance();
        }
        args.push(scanner.source.slice(curIdx, scanner.current));

        scanner.advance();
        const range = new LocRange(token.location!.start, scanner.getPosition());
        replace = macro.expand(...args);
        const expanded = this.expandMacroChunk(replace, range, scanner);
        // #if _DEVELOPMENT
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        this.expandSegments.push({
          // #if _DEVELOPMENT
          block,
          // #endif
          rangeInBlock: { start: token.location!.start, end: { index: scanner.current } },
          replace: expanded.content
        });
      } else {
        const expanded = this.expandMacroChunk(replace, token.location, scanner);
        // #if _DEVELOPMENT
        const block = new BlockInfo(scanner.file, scanner.blockRange, expanded.sourceMap);
        // #endif
        this.expandSegments.push({
          // #if _DEVELOPMENT
          block,
          // #endif
          rangeInBlock: { start: token.location.start, end: { index: token.location.end.index } },
          replace: expanded.content
        });
      }
    }
  }
}
