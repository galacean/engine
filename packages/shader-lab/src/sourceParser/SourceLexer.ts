import { Color } from "@galacean/engine";
import { ETokenType, ShaderPosition, ShaderRange } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { GSErrorName } from "../GSError";
import { ShaderLab } from "../ShaderLab";
import { ShaderLabUtils } from "../ShaderLabUtils";

export default class SourceLexer extends BaseLexer {
  hasPendingContent = false;

  private static _keywordLexemeTable = <Record<string, Keyword>>{
    RenderQueueType: Keyword.GSRenderQueueType,
    BlendState: Keyword.GSBlendState,
    DepthState: Keyword.GSDepthState,
    StencilState: Keyword.GSStencilState,
    RasterState: Keyword.GSRasterState,
    EditorProperties: Keyword.GSEditorProperties,
    EditorMacros: Keyword.GSEditorMacros,
    Editor: Keyword.GSEditor,
    Tags: Keyword.GSTags,
    VertexShader: Keyword.GSVertexShader,
    FragmentShader: Keyword.GSFragmentShader,
    SubShader: Keyword.GSSubShader,
    Pass: Keyword.GSPass,
    BlendFactor: Keyword.GSBlendFactor,
    BlendOperation: Keyword.GSBlendOperation,
    Bool: Keyword.GSBool,
    Number: Keyword.GSNumber,
    Color: Keyword.GSColor,
    CompareFunction: Keyword.GSCompareFunction,
    StencilOperation: Keyword.GSStencilOperation,
    CullMode: Keyword.GSCullMode,
    UsePass: Keyword.GSUsePass,

    true: Keyword.True,
    false: Keyword.False
  };

  private static _symbolLexemeTable = <Record<string, Keyword>>{
    "{": Keyword.LeftBrace,
    "}": Keyword.RightBrace,
    "=": Keyword.Equal
  };

  private static _isWordSeparatorChar(charCode: number): boolean {
    return (
      charCode === 123 || // {
      charCode === 125 || // }
      charCode === 61 || // =
      charCode === 59 || // ;
      charCode === 46 || // .   CullMode.Back
      charCode === 91 || // [   Enabled[0],
      charCode === 40 // (      Color(1.0, 1.0, 1.0, 1.0);
    );
  }

  private static _scanDigits(source: string, startIndex: number): number {
    let currentIndex = startIndex;
    while (currentIndex < source.length) {
      const charCode = source.charCodeAt(currentIndex);
      if (BaseLexer.isDigit(charCode)) {
        currentIndex++;
      } else {
        break;
      }
    }
    return currentIndex;
  }

  scanNumber(): number {
    this.skipCommentsAndSpace();
    const start = this._currentIndex;
    const source = this._source;
    let index = this._currentIndex;

    // Scan integer part
    index = SourceLexer._scanDigits(source, index);

    // Scan decimal part if present
    if (source[index] === ".") {
      index = SourceLexer._scanDigits(source, index + 1);
    }

    this.advance(index - this._currentIndex);
    return Number(source.substring(start, index));
  }

  scanColor(): Color {
    this.scanLexeme("(");

    let r = 0;
    let g = 0;
    let b = 0;
    let a = 1;

    r = this.scanNumber();
    this.skipCommentsAndSpace();
    if (this.peek(1) !== ")") {
      this.scanLexeme(",");
      g = this.scanNumber();
      this.skipCommentsAndSpace();
      if (this.peek(1) !== ")") {
        this.scanLexeme(",");
        b = this.scanNumber();
        this.skipCommentsAndSpace();
        if (this.peek(1) !== ")") {
          this.scanLexeme(",");
          a = this.scanNumber();
          this.skipCommentsAndSpace();
        }
      }
    }

    this.scanLexeme(")");
    return new Color(r, g, b, a);
  }

  override scanToken(): BaseToken {
    while (true) {
      this.skipCommentsAndSpace();

      if (this.isEnd()) {
        return;
      }

      const start = this.getCurPosition();

      if (BaseLexer.isAlpha(this.getCurCharCode())) {
        const wordToken = this._scanWord(start);
        if (wordToken !== null) {
          return wordToken;
        }
        this.hasPendingContent = true;
        continue; // Continue loop to scan next token if word was invalid
      }

      const currentChar = this.getCurChar();
      const symbolKeyword = SourceLexer._symbolLexemeTable[currentChar];
      if (symbolKeyword !== undefined) {
        this.advance(1);
        const token = BaseToken.pool.get();
        token.set(symbolKeyword, currentChar, start);
        return token;
      }

      // Skip unrecognized character and continue
      this.advance(1);
    }
  }

  // #if _VERBOSE
  scanToCharacter(char: string): void {
    while (this.getCurChar() !== char && !this.isEnd()) {
      this.advance(1);
    }
    this.advance(1);
  }
  // #endif

  createCompileError(message: string, location?: ShaderPosition | ShaderRange) {
    return ShaderLabUtils.createGSError(
      message,
      GSErrorName.CompilationError,
      this.source,
      location ?? this.getCurPosition()
    );
  }

  private _scanWord(start: ShaderPosition): BaseToken | null {
    // Scan the complete word first
    while (BaseLexer._isWordChar(this.getCurCharCode()) && !this.isEnd()) {
      this.advance(1);
    }
    const end = this.getCurPosition();

    // Validate both boundaries in one optimized call
    if (!this._validateWordBoundaries(start.index, end.index)) {
      return null; // Invalid word due to boundary violation
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = SourceLexer._keywordLexemeTable[lexeme] ?? ETokenType.ID;
    const range = ShaderLab.createRange(start, end);
    const token = BaseToken.pool.get();
    token.set(tokenType, lexeme, range);
    return token;
  }

  private _validateWordBoundaries(startIndex: number, endIndex: number): boolean {
    const source = this._source;

    // Check previous boundary
    if (startIndex > 0) {
      const prevCharCode = source.charCodeAt(startIndex - 1);
      if (!this._isValidWordBoundary(prevCharCode)) {
        return false;
      }
    }

    // Check next boundary
    if (endIndex < source.length) {
      const nextCharCode = source.charCodeAt(endIndex);
      if (!this._isValidWordBoundary(nextCharCode)) {
        return false;
      }
    }

    return true;
  }

  private _isValidWordBoundary(charCode: number): boolean {
    return BaseLexer._isWhiteSpaceChar(charCode, true) || SourceLexer._isWordSeparatorChar(charCode);
  }
}
