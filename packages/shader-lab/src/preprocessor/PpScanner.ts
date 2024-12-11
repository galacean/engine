import { ShaderRange, ShaderPosition } from "../common";
import LexerUtils from "../lexer/Utils";
// #if _VERBOSE
import PpSourceMap from "./sourceMap";
// #endif
import BaseScanner from "../common/BaseScanner";
import { BaseToken, EOF } from "../common/BaseToken";
import { EPpKeyword, EPpToken, PpKeyword } from "./constants";
import { PpUtils } from "./Utils";
import { ShaderLab } from "../ShaderLab";

export type OnToken = (token: BaseToken, scanner: PpScanner) => void;

export default class PpScanner extends BaseScanner {
  private macroLvl = 0;

  // #if _VERBOSE
  readonly sourceMap = new PpSourceMap();
  readonly file: string;
  readonly blockRange?: ShaderRange;
  // #endif

  constructor(
    source: string,
    // #if _VERBOSE
    file = "__main__",
    blockRange?: ShaderRange
    // #endif
  ) {
    super(source);
    // #if _VERBOSE
    this.file = file;
    this.blockRange = blockRange;
    // #endif
  }

  /**
   * Advance to directive
   * @param expandOnToken callback on encountering token.
   */
  scanDirective(expandOnToken?: OnToken): BaseToken<number> {
    const directive = this._advanceToDirective(expandOnToken);
    if ([EPpKeyword.if, EPpKeyword.ifdef, EPpKeyword.ifndef].includes(<any>directive?.type)) {
      this.macroLvl += 1;
    } else if (<any>directive?.type === EPpKeyword.endif) {
      this.macroLvl -= 1;
    }
    return directive;
  }

  /**
   * @param nonLetterChar should not be space
   */
  scanWordsUntilChar(nonLetterChar: string): BaseToken[] {
    const ret: BaseToken[] = [];
    while (true) {
      this.skipSpace(true);
      if (LexerUtils.isLetter(this.getCurCharCode())) {
        ret.push(this.scanWord());
      } else if (this.getCurChar() === nonLetterChar) {
        this._advance();
        return ret;
      } else {
        this._advance();
      }
    }
  }

  scanWord(skipNonLetter = false): BaseToken {
    if (skipNonLetter) {
      while (!LexerUtils.isLetter(this.getCurCharCode()) && !this.isEnd()) {
        this._advance();
      }
    } else {
      this.skipSpace(true);
    }

    if (this.isEnd()) return EOF;

    const start = this._currentIndex;
    while (LexerUtils.isLetter(this.getCurCharCode()) && !this.isEnd()) {
      this._advance();
    }
    const end = this._currentIndex;
    const word = this._source.slice(start, end);
    if (end === start) {
      this.throwError(this.getShaderPosition(0), "no word found.");
    }
    const kw = PpKeyword.get(word);
    if (kw) {
      const token = BaseToken.pool.get();
      token.set(kw, word, this.getShaderPosition(0));
      return token;
    }

    const token = BaseToken.pool.get();
    token.set(EPpToken.id, word, this.getShaderPosition(word.length));
    return token;
  }

  /**
   * @param offset - Offset from starting point
   */
  getShaderPosition(offset: number) {
    return ShaderLab.createPosition(
      this._currentIndex - offset,
      // #if _VERBOSE
      this.line,
      this.column - offset
      // #endif
    );
  }

  /**
   * @param onToken callback when encounter a token
   * @returns token split by space
   */
  override scanToken(onToken?: OnToken): BaseToken | undefined {
    this.skipCommentsAndSpace();
    if (this.isEnd()) {
      return;
    }
    let start = this._currentIndex;
    const { _source: source } = this;
    for (let i = start; i < source.length; ) {
      if (LexerUtils.isPpCharactors(source.charCodeAt(i))) {
        this._advance();
        i++;
      } else if (i === start) {
        this._advance();
        this.skipCommentsAndSpace();
        i = start = this._currentIndex;
      } else {
        break;
      }
    }

    const lexeme = source.slice(start, this._currentIndex);
    const ret = BaseToken.pool.get();
    const tokenType = PpKeyword.get(lexeme);
    ret.set(
      tokenType == undefined ? EPpToken.id : PpKeyword.get(lexeme),
      lexeme,
      this.getShaderPosition(this._currentIndex - start)
    );
    onToken?.(ret, this);
    return ret;
  }

  scanQuotedString(): BaseToken<EPpToken.string_const> {
    this.skipSpace(true);
    if (this.getCurChar() !== '"') {
      this.throwError(this.getShaderPosition(0), "unexpected char, expected '\"'");
    }
    const ShaderPosition = this.getShaderPosition(0);
    this._advance();
    const start = this._currentIndex;
    while (this.getCurChar() !== '"' && !this.isEnd()) this._advance();
    if (this.isEnd()) {
      this.throwError(this.getShaderPosition(0), "unexpected char, expected '\"'");
    }
    const word = this._source.slice(start, this._currentIndex);

    const token = BaseToken.pool.get();
    token.set(EPpToken.string_const, word, ShaderPosition);
    return token;
  }

  scanToChar(char: string) {
    const source = this._source;
    while (source[this._currentIndex] !== char && !this.isEnd()) {
      this._advance();
    }
  }

  scanMacroBranchChunk(): {
    token: BaseToken<EPpToken.chunk>;
    nextDirective: BaseToken;
  } {
    const start = this._currentIndex;
    const ShaderPosition = this.getShaderPosition(0);

    const startLvl = this.macroLvl;
    let directive = this.scanDirective()!;

    while (true) {
      if (directive.type === EPpKeyword.endif && startLvl - 1 === this.macroLvl) break;
      else if ([EPpKeyword.elif, EPpKeyword.else].includes(<EPpKeyword>directive.type) && startLvl === this.macroLvl)
        break;
      directive = this.scanDirective()!;
    }

    const chunk = this._source.slice(start, this._currentIndex - directive.lexeme.length - 1);
    const token = BaseToken.pool.get();
    token.set(EPpToken.chunk, chunk, ShaderPosition);
    return { token, nextDirective: directive };
  }

  scanPairedBlock(lc: string, rc: string): void {
    this.scanToChar(lc);
    let level = 0;
    const source = this._source;

    do {
      const curChar = source[this._currentIndex];

      if (curChar === lc) {
        level++;
      } else if (curChar === rc) {
        level--;
      }
      this._advance();
    } while (level > 0);
  }

  /**
   * @returns end ShaderPosition
   */
  scanRemainMacro(): ShaderPosition {
    const startLvl = this.macroLvl;
    let directive = this.scanDirective()!;
    while (!this.isEnd() && (directive.type !== EPpKeyword.endif || startLvl - 1 !== this.macroLvl)) {
      directive = this.scanDirective()!;
    }
    return this.getShaderPosition(0);
  }

  peekNonSpace() {
    let current = this._currentIndex;
    while (/\s/.test(this._source[current])) {
      current += 1;
    }
    return this._source[current];
  }

  scanInteger() {
    const start = this._currentIndex;
    while (LexerUtils.isNum(this.getCurCharCode())) {
      this._advance();
    }
    if (this._currentIndex === start) {
      this.throwError(this.getShaderPosition(0), "no integer found");
    }
    const integer = this._source.slice(start, this._currentIndex);

    const token = BaseToken.pool.get();
    token.set(EPpToken.int_constant, integer, this.getShaderPosition(0));
    return token;
  }

  /**
   * Skip comments
   */
  scanLineRemain() {
    this.skipSpace(false);
    const start = this._currentIndex;

    const comments: ShaderRange[] = [];

    while (this.getCurChar() !== "\n") {
      if (this.isEnd()) {
        const line = this._source.slice(start, this._currentIndex);

        const token = BaseToken.pool.get();
        token.set(EPpToken.line_remain, line, this.getShaderPosition(line.length));
        return token;
      }
      this._advance();
      const commentRange = this._skipComments();
      if (commentRange) {
        commentRange.start.index -= start;
        commentRange.end.index -= start;
        comments.push(commentRange);
      }
    }
    let line = this._source.slice(start, this._currentIndex);
    if (comments.length) {
      // filter comments
      line = PpUtils.assembleSegments(
        comments.map((item) => ({ range: item, replace: "" })),
        line
      );
    }

    const token = BaseToken.pool.get();
    token.set(EPpToken.line_remain, line, this.getShaderPosition(line.length));
    return token;
  }

  private _advanceToDirective(onToken?: OnToken): BaseToken | undefined {
    while (true) {
      const token = this.scanToken(onToken);
      if (token?.lexeme.startsWith("#")) return token;
      if (this.isEnd()) return;
    }
  }

  private _skipComments(): ShaderRange | undefined {
    if (this.peek(2) === "//") {
      const start = this.getShaderPosition(0);
      // single line comments
      while (this.getCurChar() !== "\n" && !this.isEnd()) {
        this._advance();
      }
      return ShaderLab.createRange(start, this.getCurPosition());
    } else if (this.peek(2) === "/*") {
      const start = this.getShaderPosition(0);
      //  multi-line comments
      this.advance(2);
      while (this.peek(2) !== "*/" && !this.isEnd()) {
        this._advance();
      }
      this.advance(2);
      return ShaderLab.createRange(start, this.getShaderPosition(0));
    }
  }
}
