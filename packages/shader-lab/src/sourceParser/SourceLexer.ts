import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken } from "../common/BaseToken";
import { Keyword } from "../common/enums/Keyword";
import { ShaderLab } from "../ShaderLab";

export default class SourceLexer extends BaseLexer {
  private static _keywordTable = <Record<string, Keyword>>{
    RenderQueueType: Keyword.GS_RenderQueueType,
    BlendState: Keyword.GS_BlendState,
    DepthState: Keyword.GS_DepthState,
    StencilState: Keyword.GS_StencilState,
    RasterState: Keyword.GS_RasterState,
    EditorProperties: Keyword.GS_EditorProperties,
    EditorMacros: Keyword.GS_EditorMacros,
    Editor: Keyword.GS_Editor,
    Tags: Keyword.GS_Tags,
    VertexShader: Keyword.GS_VertexShader,
    FragmentShader: Keyword.GS_FragmentShader,
    SubShader: Keyword.GS_SubShader,
    Pass: Keyword.GS_Pass,
    BlendFactor: Keyword.GS_BlendFactor,
    BlendOperation: Keyword.GS_BlendOperation,
    Bool: Keyword.GS_Bool,
    Number: Keyword.GS_Number,
    CompareFunction: Keyword.GS_CompareFunction,
    StencilOperation: Keyword.GS_StencilOperation,
    CullMode: Keyword.GS_CullMode,
    true: Keyword.TRUE,
    false: Keyword.FALSE,
    UsePass: Keyword.GS_UsePass,
    Color: Keyword.GS_Color
  };
  private static _wordCharRegex = /\w/;

  /**
   * split by space
   */
  scanWord(): string {
    this.skipCommentsAndSpace();
    const start = this._currentIndex;
    while (/\S/.test(this.getCurChar()) && !this.isEnd()) this._advance();
    return this._source.substring(start, this._currentIndex);
  }

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

  override scanToken(onToken?: OnToken): BaseToken {
    const wordCharRegex = SourceLexer._wordCharRegex;

    this.skipCommentsAndSpace();
    
    const start = this.getCurPosition();
    if (this.isEnd()) return;

    while (wordCharRegex.test(this.getCurChar()) && !this.isEnd()) {
      this._advance();
    }

    const end = this.getCurPosition();

    if (start.index === end.index) {
      this._advance();
      const token = BaseToken.pool.get();
      token.set(ETokenType.NOT_WORD, this._source[start.index], start);
      onToken?.(token, this);
      return token;
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = SourceLexer._keywordTable[lexeme] ?? ETokenType.ID;
    const range = ShaderLab.createRange(start, end);
    const token = BaseToken.pool.get();
    token.set(tokenType, lexeme, range);
    onToken?.(token, this);
    return token;
  }
}

export type OnToken = (token: BaseToken, scanner: BaseLexer) => void;
