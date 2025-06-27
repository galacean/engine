import { ShaderPosition, ShaderRange } from "../common";
// #if _VERBOSE
import PpSourceMap from "./sourceMap";
// #endif
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken, EOF } from "../common/BaseToken";
import { ShaderLab } from "../ShaderLab";
import { PpKeyword, PpToken } from "./constants";

export type OnToken = (token: BaseToken, scanner: PpLexer) => void;

export default class PpLexer extends BaseLexer {
  private static _isPpCharacters(charCode: number): boolean {
    return (
      charCode === 35 || // #
      BaseLexer.isAlnum(charCode) // _, A-Z, a-z, 0-9
    );
  }

  private static _lexemeTable = <Record<string, PpKeyword>>{
    "#define": PpKeyword.define,
    "#undef": PpKeyword.undef,
    "#if": PpKeyword.if,
    "#ifdef": PpKeyword.ifdef,
    "#ifndef": PpKeyword.ifndef,
    "#else": PpKeyword.else,
    "#elif": PpKeyword.elif,
    "#endif": PpKeyword.endif,
    "#include": PpKeyword.include,
    defined: PpKeyword.defined
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
      if (type === PpKeyword.if || type === PpKeyword.ifdef || type === PpKeyword.ifndef) {
        this.macroLvl++;
      } else if (type === PpKeyword.endif) {
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
    const tokenType = PpLexer._lexemeTable[word] ?? PpToken.id;
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
    token.set(tokenType ?? PpToken.id, lexeme, this.getShaderPosition(this._currentIndex - start));
    onToken?.(token, this);
    return token;
  }

  scanQuotedString(): BaseToken<PpToken.string_const> {
    this.skipSpace(true);
    const source = this._source;
    const sourceLength = source.length;
    const start = this.getShaderPosition(0);

    let index = this._currentIndex;

    // Check for opening quote
    if (source.charCodeAt(index) !== 34) {
      // 34 = '"'
      this.throwError(start, "Unexpected char, expected '\"'");
    }

    const contentStart = ++index; // Skip opening quote and record start

    // Fast scan to closing quote
    while (index < sourceLength && source.charCodeAt(index) !== 34) {
      index++;
    }

    if (index >= sourceLength) {
      this.throwError(this.getShaderPosition(0), "Unexpected char, expected '\"'");
    }

    const lexeme = source.slice(contentStart, index);
    this.advance(index + 1 - this._currentIndex); // Skip to after closing quote

    const token = BaseToken.pool.get();
    token.set(PpToken.string_const, lexeme, start);
    return token;
  }

  scanToChar(char: string) {
    const source = this._source;
    while (source[this._currentIndex] !== char && !this.isEnd()) {
      this.advance(1);
    }
  }

  scanMacroBranchBody(): {
    body: BaseToken<PpToken.chunk>;
    nextDirective: BaseToken;
  } {
    const shaderPosition = this.getShaderPosition(0);
    const startLevel = this.macroLvl;

    let nextDirective = this.scanDirective()!;
    while (true) {
      const { type } = nextDirective;
      if (type === PpKeyword.endif && startLevel - 1 === this.macroLvl) {
        break;
      } else if ((type === PpKeyword.elif || type === PpKeyword.else) && startLevel === this.macroLvl) {
        break;
      }
      nextDirective = this.scanDirective()!;
    }

    const lexeme = this._source.slice(shaderPosition.index, this._currentIndex - nextDirective.lexeme.length - 1);
    const body = BaseToken.pool.get();
    body.set(PpToken.chunk, lexeme, shaderPosition);
    return { body, nextDirective };
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
    while (!this.isEnd() && (directive.type !== PpKeyword.endif || startLvl - 1 !== this.macroLvl)) {
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
    token.set(PpToken.int_constant, integer, this.getShaderPosition(0));
    return token;
  }

  scanMacroBody(): BaseToken<PpToken.line_remain> {
    this.skipSpace(false);
    let lexeme = "";
    const source = this._source;
    const sourceLength = source.length;

    const start = this.getShaderPosition(0);
    while (this._currentIndex < sourceLength) {
      const charCode = source.charCodeAt(this._currentIndex);

      // Check for line break (terminates macro definition), break when encounter "\n"
      if (charCode === 10) {
        break;
      }

      // Check for comments (both single-line and multi-line)
      if (charCode === 47) {
        const nextIndex = this._currentIndex + 1;
        if (nextIndex < sourceLength) {
          const nextCharCode = source.charCodeAt(nextIndex);

          // Single-line comment (terminates macro definition), break when encounter "//"
          if (nextCharCode === 47) {
            break;
          }

          // Multi-line comment (skip but don't terminate)
          if (nextCharCode === 42) {
            this.advance(2); // Skip "/*"

            // Skip until end of multi-line comment
            while (this._currentIndex + 1 < sourceLength) {
              const currentIndex = this._currentIndex;
              if (source.charCodeAt(currentIndex) === 42 && source.charCodeAt(currentIndex + 1) === 47) {
                this.advance(2); // Skip "*/
                break;
              }
              this.advance(1);
            }

            lexeme += " "; // Replace comment with space
            continue;
          }
        }
      }

      // Accumulate useful character
      lexeme += source[this._currentIndex];
      this.advance(1);
    }

    const valueToken = BaseToken.pool.get();
    valueToken.set(PpToken.line_remain, lexeme, ShaderLab.createRange(start, this.getShaderPosition(0)));
    return valueToken;
  }
}
