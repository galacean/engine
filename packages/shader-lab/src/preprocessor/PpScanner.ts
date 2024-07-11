import { IIndexRange, ShaderPosition } from "../common";
import LexerUtils from "../lexer/Utils";
// #if _EDITOR
import PpSourceMap from "./sourceMap";
// #endif
import BaseScanner from "../common/BaseScanner";
import { BaseToken, EOF } from "../common/BaseToken";
import { ParserUtils } from "../Utils";
import { EPpKeyword, EPpToken, PpKeyword } from "./constants";
import { PpUtils } from "./Utils";

export type OnToken = (token: BaseToken, scanner: PpScanner) => void;

export default class PpScanner extends BaseScanner {
  private static _splitCharacters = /[\w#.]/;

  private line: number = 0;
  private column: number = 0;

  private macroLvl = 0;

  // #if _EDITOR
  readonly sourceMap = new PpSourceMap();
  readonly file: string;
  readonly blockRange?: IIndexRange;
  // #endif

  constructor(
    source: string,
    // #if _EDITOR
    file = "__main__",
    blockRange?: IIndexRange
    // #endif
  ) {
    super(source);
    // #if _EDITOR
    this.file = file;
    this.blockRange = blockRange;
    // #endif
  }

  /**
   * Advance to directive
   * @param expandOnToken callback on encountering token.
   */
  scanDirective(expandOnToken?: OnToken): BaseToken<number> {
    const directive = this.advanceToDirective(expandOnToken);
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
      if (LexerUtils.isLetter(this.getCurChar())) {
        ret.push(this.scanWord());
      } else if (this.getCurChar() === nonLetterChar) {
        this.advance();
        return ret;
      } else {
        this.advance();
      }
    }
  }

  scanWord(skipNonLetter = false): BaseToken {
    if (skipNonLetter) {
      while (!LexerUtils.isLetter(this.getCurChar()) && !this.isEnd()) {
        this.advance();
      }
    } else {
      this.skipSpace(true);
    }

    if (this.isEnd()) return EOF;

    const start = this._currentIndex;
    while (LexerUtils.isLetter(this.getCurChar())) {
      this.advance();
    }
    const end = this._currentIndex;
    const word = this._source.slice(start, end);
    if (end === start) {
      ParserUtils.throw(this.getShaderPosition(), "no word found.");
    }
    const kw = PpKeyword.get(word);
    if (kw) {
      return new BaseToken(kw, word, this.getShaderPosition());
    }

    return new BaseToken(EPpToken.id, word, this.getShaderPosition(word.length));
  }

  getShaderPosition(offset /** offset from starting point */ = 0) {
    return new ShaderPosition(this._currentIndex - offset, this.line, this.column - offset);
  }

  /**
   * @param onToken callback when encounter a token
   * @returns token split by space
   */
  override scanToken(onToken?: OnToken): BaseToken | undefined {
    this.skipSpace(true);
    this.skipComments();
    if (this.isEnd()) {
      return;
    }
    const start = this._currentIndex;
    while (PpScanner._splitCharacters.test(this.getCurChar()) && !this.isEnd()) {
      this._advance();
    }

    // Not advance
    if (start === this._currentIndex) {
      this._advance();
      return this.scanToken(onToken);
    }

    const lexeme = this._source.slice(start, this._currentIndex);

    const ret = new BaseToken(
      PpKeyword.has(lexeme) ? PpKeyword.get(lexeme) : EPpToken.id,
      lexeme,
      this.getShaderPosition(this._currentIndex - start)
    );
    onToken?.(ret, this);
    return ret;
  }

  scanQuotedString(): BaseToken<EPpToken.string_const> {
    this.skipSpace(true);
    if (this.getCurChar() !== '"') {
      ParserUtils.throw(this.getShaderPosition(), "unexpected char, expected '\"'");
    }
    const ShaderPosition = this.getShaderPosition();
    this._advance();
    const start = this._currentIndex;
    while (this.getCurChar() !== '"' && !this.isEnd()) this._advance();
    if (this.isEnd()) {
      ParserUtils.throw(this.getShaderPosition(), "unexpected char, expected '\"'");
    }
    const word = this._source.slice(start, this._currentIndex);
    return new BaseToken(EPpToken.string_const, word, ShaderPosition);
  }

  scanToChar(char: string) {
    while (this.getCurChar() !== char && !this.isEnd()) {
      this.advance();
    }
  }

  scanMacroBranchChunk(): {
    token: BaseToken<EPpToken.chunk>;
    nextDirective: BaseToken;
  } {
    const start = this._currentIndex;
    const ShaderPosition = this.getShaderPosition();

    const startLvl = this.macroLvl;
    let directive = this.scanDirective()!;

    while (true) {
      if (directive.type === EPpKeyword.endif && startLvl - 1 === this.macroLvl) break;
      else if ([EPpKeyword.elif, EPpKeyword.else].includes(<EPpKeyword>directive.type) && startLvl === this.macroLvl)
        break;
      directive = this.scanDirective()!;
    }

    const chunk = this._source.slice(start, this._currentIndex - directive.lexeme.length - 1);
    const token = new BaseToken(EPpToken.chunk, chunk, ShaderPosition);
    return { token, nextDirective: directive };
  }

  // #if !_EDITOR
  scanPairedBlock(lc = "{", rc = "}") {
    this.scanToChar(lc);
    let lvl = 0;
    do {
      if (this.getCurChar() === lc) lvl += 1;
      else if (this.getCurChar() === rc) lvl -= 1;
      this._advance();
    } while (lvl > 0);
  }
  // #endif

  /**
   * @returns end ShaderPosition
   */
  scanRemainMacro(): ShaderPosition {
    const startLvl = this.macroLvl;
    let directive = this.scanDirective()!;
    while (!this.isEnd() && (directive.type !== EPpKeyword.endif || startLvl - 1 !== this.macroLvl)) {
      directive = this.scanDirective()!;
    }
    return this.getShaderPosition();
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
    while (LexerUtils.isNum(this.getCurChar())) {
      this.advance();
    }
    if (this._currentIndex === start) {
      ParserUtils.throw(this.getShaderPosition(), "no integer found");
    }
    const integer = this._source.slice(start, this._currentIndex);
    return new BaseToken(EPpToken.int_constant, integer, this.getShaderPosition());
  }

  /**
   * Skip comments
   */
  scanLineRemain() {
    this.skipSpace(false);
    const start = this._currentIndex;

    const comments: IIndexRange[] = [];

    while (this.getCurChar() !== "\n") {
      if (this.isEnd()) {
        const line = this._source.slice(start, this._currentIndex);
        return new BaseToken(EPpToken.line_remain, line, this.getShaderPosition(line.length));
      }
      this.advance();
      const commentRange = this.skipComments();
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
    return new BaseToken(EPpToken.line_remain, line, this.getShaderPosition(line.length));
  }

  private advanceToDirective(onToken?: OnToken): BaseToken | undefined {
    while (true) {
      const token = this.scanToken(onToken);
      if (token?.lexeme.startsWith("#")) return token;
      if (this.isEnd()) return;
    }
  }

  private skipComments(): IIndexRange | undefined {
    if (this.peek(2) === "//") {
      const start = this.getShaderPosition();
      // single line comments
      while (this.getCurChar() !== "\n" && !this.isEnd()) {
        this._advance();
      }
      return new IIndexRange(start, this.getShaderPosition());
    } else if (this.peek(2) === "/*") {
      const start = this.getShaderPosition();
      //  multi-line comments
      this.advance(2);
      while (this.peek(2) !== "*/" && !this.isEnd()) {
        this._advance();
      }
      this.advance(2);
      return new IIndexRange(start, this.getShaderPosition());
    }
  }
}
