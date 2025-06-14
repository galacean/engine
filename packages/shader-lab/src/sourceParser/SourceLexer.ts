import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ShaderLab } from "../ShaderLab";

export default class SourceLexer extends BaseLexer {
  private static _lexemeTable = <Record<string, Keyword>>{
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
    false: Keyword.False,
    "{": Keyword.LeftBrace,
    "}": Keyword.RightBrace,
    "=": Keyword.Equal,
    "[": Keyword.LeftBracket
  };
  private static _wordCharRegex = /\w/;

  private static _scanDigits(source: string, startIndex: number): number {
    let currentIndex = startIndex;
    while (true) {
      const charCode = source.charCodeAt(currentIndex);
      // '0' to '9'
      if (charCode >= 48 && charCode <= 57) {
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
    let currentIndex = this._currentIndex;

    // Scan integer part
    currentIndex = SourceLexer._scanDigits(source, currentIndex);

    // Scan decimal part if present
    if (source[currentIndex] === ".") {
      currentIndex = SourceLexer._scanDigits(source, currentIndex + 1);
    }

    this.advance(currentIndex - this._currentIndex);
    return Number(source.substring(start, currentIndex));
  }

  static xx: number = 0;

  override scanToken(): BaseToken {
    this.skipCommentsAndSpace();

    if (this.isEnd()) {
      return;
    }

    const start = this.getCurPosition();
    const wordCharRegex = SourceLexer._wordCharRegex;
    while (wordCharRegex.test(this.getCurChar()) && !this.isEnd()) {
      this._advance();
    }

    const end = this.getCurPosition();
    if (start.index === end.index) {
      this._advance();
      const token = BaseToken.pool.get();
      token.set(ETokenType.NotWord, this._source[start.index], start);
      console.log(this._source[start.index]);
      console.log(++SourceLexer.xx);
      return token;
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = SourceLexer._lexemeTable[lexeme] ?? ETokenType.ID;
    const range = ShaderLab.createRange(start, end);
    const token = BaseToken.pool.get();
    token.set(tokenType, lexeme, range);
    console.log(lexeme);
    console.log(++SourceLexer.xx);
    return token;
  }

  // #if _VERBOSE
  scanToCharacter(char: string): void {
    while (this.getCurChar() !== char && !this.isEnd()) {
      this._advance();
    }
    this._advance();
  }
  // #endif
}
