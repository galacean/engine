import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ShaderLab } from "../ShaderLab";

export default class SourceLexer extends BaseLexer {
  private static _lexemeTable = <Record<string, Keyword>>{
    RenderQueueType: Keyword.GSRenderQueueType,
    BlendState: Keyword.GS_BlendState,
    DepthState: Keyword.GS_DepthState,
    StencilState: Keyword.GS_StencilState,
    RasterState: Keyword.GS_RasterState,
    EditorProperties: Keyword.GSEditorProperties,
    EditorMacros: Keyword.GSEditorMacros,
    Editor: Keyword.GSEditor,
    Tags: Keyword.GSTags,
    VertexShader: Keyword.GS_VertexShader,
    FragmentShader: Keyword.GS_FragmentShader,
    SubShader: Keyword.GSSubShader,
    Pass: Keyword.GSPass,
    BlendFactor: Keyword.GS_BlendFactor,
    BlendOperation: Keyword.GS_BlendOperation,
    Bool: Keyword.GS_Bool,
    Number: Keyword.GS_Number,
    CompareFunction: Keyword.GS_CompareFunction,
    StencilOperation: Keyword.GS_StencilOperation,
    CullMode: Keyword.GS_CullMode,
    true: Keyword.TRUE,
    false: Keyword.FALSE,
    UsePass: Keyword.GSUsePass,
    Color: Keyword.GS_Color
  };
  private static _wordCharRegex = /\w/;

  scanNumber(): number {
    this.skipCommentsAndSpace();
    const start = this._currentIndex;
    while (/[0-9]/.test(this.getCurChar())) this._advance();
    if (this.getCurChar() === ".") {
      this._advance();
      while (/[0-9]/.test(this.getCurChar())) this._advance();
    }
    return Number(this._source.substring(start, this._currentIndex));
  }

  // #if _VERBOSE
  scanToCharacter(char: string): void {
    while (this.getCurChar() !== char && !this.isEnd()) {
      this._advance();
    }
    this._advance();
  }
  // #endif

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
      return token;
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = SourceLexer._lexemeTable[lexeme] ?? ETokenType.ID;
    const range = ShaderLab.createRange(start, end);
    const token = BaseToken.pool.get();
    token.set(tokenType, lexeme, range);
    return token;
  }
}
