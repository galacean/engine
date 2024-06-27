import LexerUtils from "../lexer/Utils";
import LocRange from "../common/LocRange";
import Position from "../common/Position";
import { PpError } from "./PpError";
// #if _DEVELOPMENT
import PpSourceMap from "./sourceMap";
// #endif
import PpToken, { EOF } from "./PpToken";
import { PpUtils } from "./Utils";
import { EPpKeyword, EPpToken, PpKeyword } from "./constants";
import { IIndexRange } from "./IndexRange";

export type OnToken = (token: PpToken, scanner: PpScanner) => void;

export default class PpScanner extends PpError {
  private _current = 0;
  get current() {
    return this._current;
  }

  private line: number = 0;
  private column: number = 0;

  private macroLvl = 0;
  private _source: string;
  get source() {
    return this._source;
  }

  // #if _DEVELOPMENT
  readonly sourceMap = new PpSourceMap();
  readonly file: string;
  readonly blockRange?: IIndexRange;
  // #endif

  constructor(
    source: string,
    // #if _DEVELOPMENT
    file = "__main__",
    blockRange?: IIndexRange
    // #endif
  ) {
    super();
    this._source = source;
    // #if _DEVELOPMENT
    this.file = file;
    this.blockRange = blockRange;
    // #endif
  }

  curChar() {
    return this._source[this._current];
  }

  isEnd() {
    return this._current >= this._source.length;
  }

  /**
   * Advance to directive
   * @param expandOnToken callback on encountering token.
   */
  scanDirective(expandOnToken?: OnToken) {
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
  scanWordsUntilChar(nonLetterChar: string): PpToken[] {
    const ret: PpToken[] = [];
    while (true) {
      this.skipSpace();
      if (LexerUtils.isLetter(this.curChar())) {
        ret.push(this.scanWord());
      } else if (this.curChar() === nonLetterChar) {
        this.advance();
        return ret;
      } else {
        this.advance();
      }
    }
  }

  advance(count = 1) {
    for (let i = 0; i < count; i++) this._advance();
  }

  skipSpace(includeLineBreak = true) {
    const spaces = includeLineBreak ? [" ", "\t", "\n"] : [" ", "\t"];
    while (spaces.indexOf(this.curChar()) != -1) {
      this._advance();
    }
  }

  scanWord(skipNonLetter = false): PpToken {
    if (skipNonLetter) {
      while (!LexerUtils.isLetter(this.curChar()) && !this.isEnd()) {
        this.advance();
      }
    } else {
      this.skipSpace();
    }

    if (this.isEnd()) return EOF;

    const start = this._current;
    while (LexerUtils.isLetter(this.curChar())) {
      this.advance();
    }
    const end = this._current;
    const word = this._source.slice(start, end);
    if (end === start) {
      this.throw(this.getPosition(), "no word found.");
    }
    const kw = PpKeyword.get(word);
    if (kw) {
      return new PpToken(kw, word, this.getPosition());
    }

    return new PpToken(EPpToken.id, word, this.getPosition(word.length));
  }

  getPosition(offset /** offset from starting point */ = 0) {
    return new Position(this._current - offset, this.line, this.column - offset);
  }

  /**
   * @param onToken callback when encounter a token
   * @returns token split by space
   */
  scanToken(onToken?: OnToken): PpToken | undefined {
    this.skipSpace();
    this.skipComments();
    if (this.isEnd()) return;
    const start = this._current;
    while (/[\w#.]/.test(this.curChar()) && !this.isEnd()) {
      this._advance();
    }
    if (start === this._current) {
      this._advance();
      return this.scanToken(onToken);
    }
    const lexeme = this._source.slice(start, this._current);
    const ret = new PpToken(PpKeyword.get(lexeme) ?? EPpToken.id, lexeme, this.getPosition(this._current - start));
    onToken?.(ret, this);
    return ret;
  }

  scanQuotedString(): PpToken<EPpToken.string_const> {
    this.skipSpace();
    if (this.curChar() !== '"') {
      this.throw(this.getPosition(), "unexpected char, expected '\"'");
    }
    const position = this.getPosition();
    this._advance();
    const start = this._current;
    while (this.curChar() !== '"' && !this.isEnd()) this._advance();
    if (this.isEnd()) {
      this.throw(this.getPosition(), "unexpected char, expected '\"'");
    }
    const word = this._source.slice(start, this._current);
    return new PpToken(EPpToken.string_const, word, position);
  }

  scanToChar(char: string) {
    while (this.curChar() !== char && !this.isEnd()) {
      this.advance();
    }
  }

  scanMacroBranchChunk(): {
    token: PpToken<EPpToken.chunk>;
    nextDirective: PpToken;
  } {
    const start = this._current;
    const position = this.getPosition();

    const startLvl = this.macroLvl;
    let directive = this.scanDirective()!;

    while (true) {
      if (directive.type === EPpKeyword.endif && startLvl - 1 === this.macroLvl) break;
      else if ([EPpKeyword.elif, EPpKeyword.else].includes(<EPpKeyword>directive.type) && startLvl === this.macroLvl)
        break;
      directive = this.scanDirective()!;
    }

    const chunk = this._source.slice(start, this._current - directive.length - 1);
    const token = new PpToken(EPpToken.chunk, chunk, position);
    return { token, nextDirective: directive };
  }

  // #if !_DEVELOPMENTMENT
  scanPairedBlock(lc = "{", rc = "}") {
    this.scanToChar(lc);
    let lvl = 0;
    do {
      if (this.curChar() === lc) lvl += 1;
      else if (this.curChar() === rc) lvl -= 1;
      this._advance();
    } while (lvl > 0);
  }
  // #endif

  /**
   * @returns end position
   */
  scanRemainMacro(): Position {
    const startLvl = this.macroLvl;
    let directive = this.scanDirective()!;
    while (directive.type !== EPpKeyword.endif || startLvl - 1 !== this.macroLvl) {
      directive = this.scanDirective()!;
    }
    return this.getPosition();
  }

  peekNonSpace() {
    let current = this._current;
    while (/\s/.test(this._source[current])) {
      current += 1;
    }
    return this._source[current];
  }

  peek(offset = 1) {
    return this._source.slice(this._current, this._current + offset);
  }

  scanInteger() {
    const start = this._current;
    while (LexerUtils.isNum(this.curChar())) {
      this.advance();
    }
    if (this._current === start) {
      this.throw(this.getPosition(), "no integer found");
    }
    const integer = this._source.slice(start, this._current);
    return new PpToken(EPpToken.int_constant, integer, this.getPosition());
  }

  /**
   * Skip comments
   */
  scanLineRemain() {
    this.skipSpace(false);
    const start = this._current;

    const comments: LocRange[] = [];

    while (this.curChar() !== "\n") {
      if (this.isEnd()) {
        const line = this._source.slice(start, this._current);
        return new PpToken(EPpToken.line_remain, line, this.getPosition(line.length));
      }
      this.advance();
      const commentRange = this.skipComments();
      if (commentRange) {
        commentRange.start.index -= start;
        commentRange.end.index -= start;
        comments.push(commentRange);
      }
    }
    let line = this._source.slice(start, this._current);
    if (comments.length) {
      // filter comments
      line = PpUtils.assembleSegments(
        comments.map((item) => ({ range: item, replace: "" })),
        line
      );
    }
    return new PpToken(EPpToken.line_remain, line, this.getPosition(line.length));
  }

  private _advance() {
    if (this.isEnd()) return;
    if (this.curChar() === "\n") {
      this.line += 1;
      this.column = 0;
    } else {
      this.column += 1;
    }
    this._current++;
  }

  private advanceToDirective(onToken?: OnToken): PpToken | undefined {
    while (true) {
      const token = this.scanToken(onToken);
      if (token?.lexeme.startsWith("#")) return token;
      if (this.isEnd()) return;
    }
  }

  private skipComments(): LocRange | undefined {
    if (this.peek(2) === "//") {
      const start = this.getPosition();
      // single line comments
      while (this.curChar() !== "\n" && !this.isEnd()) this._advance();
      return new LocRange(start, this.getPosition());
    } else if (this.peek(2) === "/*") {
      const start = this.getPosition();
      //  multi-line comments
      this._advance();
      this._advance();
      while (this.peek(2) !== "*/" && !this.isEnd()) this._advance();
      this._advance();
      this._advance();
      return new LocRange(start, this.getPosition());
    }
  }
}
