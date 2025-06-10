import { ETokenType } from "../common";
import { BaseLexer } from "../common/BaseLexer";
import { BaseToken } from "../common/BaseToken";
import { EKeyword } from "../common/Keywords";
import { ShaderLab } from "../ShaderLab";

export default class SourceLexer extends BaseLexer {
  private static _keywordMap = new Map([
    ["RenderQueueType", EKeyword.GS_RenderQueueType],
    ["BlendState", EKeyword.GS_BlendState],
    ["DepthState", EKeyword.GS_DepthState],
    ["StencilState", EKeyword.GS_StencilState],
    ["RasterState", EKeyword.GS_RasterState],
    ["EditorProperties", EKeyword.GS_EditorProperties],
    ["EditorMacros", EKeyword.GS_EditorMacros],
    ["Editor", EKeyword.GS_Editor],
    ["Tags", EKeyword.GS_Tags],
    ["VertexShader", EKeyword.GS_VertexShader],
    ["FragmentShader", EKeyword.GS_FragmentShader],
    ["SubShader", EKeyword.GS_SubShader],
    ["Pass", EKeyword.GS_Pass],
    ["BlendFactor", EKeyword.GS_BlendFactor],
    ["BlendOperation", EKeyword.GS_BlendOperation],
    ["Bool", EKeyword.GS_Bool],
    ["Number", EKeyword.GS_Number],
    ["CompareFunction", EKeyword.GS_CompareFunction],
    ["StencilOperation", EKeyword.GS_StencilOperation],
    ["CullMode", EKeyword.GS_CullMode],
    ["true", EKeyword.TRUE],
    ["false", EKeyword.FALSE],
    ["UsePass", EKeyword.GS_UsePass],
    ["Color", EKeyword.GS_Color]
  ]);

  constructor(source: string) {
    super(source);
  }

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

  override scanToken(onToken?: OnToken, splitCharRegex = /\w/) {
    this.skipCommentsAndSpace();
    const start = this.getCurPosition();
    if (this.isEnd()) return;
    while (splitCharRegex.test(this.getCurChar()) && !this.isEnd()) this._advance();
    const end = this.getCurPosition();

    if (start.index === end.index) {
      this._advance();
      const token = BaseToken.pool.get();
      token.set(ETokenType.NOT_WORD, this._source[start.index], start);
      onToken?.(token, this);
      return token;
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = SourceLexer._keywordMap.get(lexeme) ?? ETokenType.ID;
    const range = ShaderLab.createRange(start, end);
    const token = BaseToken.pool.get();
    token.set(tokenType, lexeme, range);
    onToken?.(token, this);
    return token;
  }
}

export type OnToken = (token: BaseToken, scanner: BaseLexer) => void;
