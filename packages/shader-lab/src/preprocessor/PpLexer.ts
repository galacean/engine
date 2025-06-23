import { ShaderPosition, ShaderRange } from "../common";
// #if _VERBOSE
import PpSourceMap from "./sourceMap";
// #endif
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, EOF } from "../common/BaseToken";
import { ShaderLab } from "../ShaderLab";
import { EPpKeyword, EPpToken } from "./constants";
import { PpUtils } from "./Utils";

export type OnToken = (token: BaseToken, scanner: PpLexer) => void;

export default class PpLexer extends BaseLexer {
  private static _isPpCharacters(charCode: number): boolean {
    return (
      charCode === 35 || // #
      BaseLexer.isAlnum(charCode) // _, A-Z, a-z, 0-9
    );
  }

  private static _lexemeTable = <Record<string, EPpKeyword>>{
    "#define": EPpKeyword.define,
    "#undef": EPpKeyword.undef,
    "#if": EPpKeyword.if,
    "#ifdef": EPpKeyword.ifdef,
    "#ifndef": EPpKeyword.ifndef,
    "#else": EPpKeyword.else,
    "#elif": EPpKeyword.elif,
    "#endif": EPpKeyword.endif,
    "#include": EPpKeyword.include,
    defined: EPpKeyword.defined
  };

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
    let token: BaseToken | undefined;
    while (true) {
      token = this.scanToken(expandOnToken);
      if (token?.lexeme.startsWith("#")) {
        break;
      }
      if (this.isEnd()) {
        break;
      }
    }

    if (token) {
      const { type } = token;
      if (type === EPpKeyword.if || type === EPpKeyword.ifdef || type === EPpKeyword.ifndef) {
        this.macroLvl++;
      } else if (type === EPpKeyword.endif) {
        this.macroLvl--;
      }
    }
    return token;
  }

  scanWordsUntilTerminator(terminatorChar: string): BaseToken[] {
    const tokens: BaseToken[] = [];
    while (true) {
      this.skipSpace(true);
      if (BaseLexer.isAlpha(this.getCurCharCode())) {
        tokens.push(this.scanWord());
      } else if (this.getCurChar() === terminatorChar) {
        this.advance(1);
        return tokens;
      } else {
        this.advance(1);
      }
    }
  }

  scanWord(): BaseToken {
    // Skip all non-alphabetic characters, primarily used for handling defined(MACRO) syntax
    while (!BaseLexer.isAlpha(this.getCurCharCode()) && !this.isEnd()) {
      this.advance(1);
    }

    if (this.isEnd()) {
      return EOF;
    }

    const start = this._currentIndex;
    while (BaseLexer.isAlnum(this.getCurCharCode()) && !this.isEnd()) {
      this.advance(1);
    }
    const end = this._currentIndex;
    const word = this._source.slice(start, end);
    if (end === start) {
      this.throwError(this.getShaderPosition(0), "no word found.");
    }

    const token = BaseToken.pool.get();
    const tokenType = PpLexer._lexemeTable[word] ?? EPpToken.id;
    token.set(tokenType, word, this.getShaderPosition(word.length));
    return token;
  }

  override scanToken(onToken?: OnToken): BaseToken | undefined {
    this.skipCommentsAndSpace();
    if (this.isEnd()) {
      return;
    }
    const source = this._source;
    let start = this._currentIndex;
    let found = false;
    for (var n = source.length; this._currentIndex < n; ) {
      if (PpLexer._isPpCharacters(source.charCodeAt(this._currentIndex))) {
        this.advance(1);
        found = true;
      } else {
        if (found) {
          break;
        }
        this.advance(1);
        this.skipCommentsAndSpace();
        start = this._currentIndex;
      }
    }

    const lexeme = source.slice(start, this._currentIndex);
    const token = BaseToken.pool.get();
    const tokenType = PpLexer._lexemeTable[lexeme];
    token.set(tokenType ?? EPpToken.id, lexeme, this.getShaderPosition(this._currentIndex - start));
    onToken?.(token, this);
    return token;
  }

  scanQuotedString(): BaseToken<EPpToken.string_const> {
    this.skipSpace(true);
    if (this.getCurChar() !== '"') {
      this.throwError(this.getShaderPosition(0), "unexpected char, expected '\"'");
    }
    const ShaderPosition = this.getShaderPosition(0);
    this.advance(1);
    const start = this._currentIndex;
    while (this.getCurChar() !== '"' && !this.isEnd()) this.advance(1);
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
      this.advance(1);
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
      this.advance(1);
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
    while (BaseLexer.isDigit(this.getCurCharCode())) {
      this.advance(1);
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
      this.advance(1);
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

  private _skipComments(): ShaderRange | undefined {
    if (this.peek(2) === "//") {
      const start = this.getShaderPosition(0);
      // single line comments
      while (this.getCurChar() !== "\n" && !this.isEnd()) {
        this.advance(1);
      }
      return ShaderLab.createRange(start, this.getShaderPosition(0));
    } else if (this.peek(2) === "/*") {
      const start = this.getShaderPosition(0);
      //  multi-line comments
      this.advance(2);
      while (this.peek(2) !== "*/" && !this.isEnd()) {
        this.advance(1);
      }
      this.advance(2);
      return ShaderLab.createRange(start, this.getShaderPosition(0));
    }
  }
}
