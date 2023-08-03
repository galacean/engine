import * as Keywords from "./keyword";
import * as Symbols from "./symbol";
import * as EditorTypes from "./EditorTypes";
import * as Types from "./GlslTypes";
import * as GLKeywords from "./GlslKeywords";
import * as Others from "./other";
import * as Values from "./value";
import * as RenderState from "./render-state";

export { Keywords, Symbols, EditorTypes, Types, GLKeywords, Others, Values, RenderState };

export const _AllTokens = [
  Others.WhiteSpace,
  Others.CommentLine,
  Others.CommentMultiLine,
  ...Symbols.tokenList,
  ...Values.tokenList,
  ...Types.tokenList,
  ...EditorTypes.tokenList,
  ...RenderState.BlendFactorTokenList,
  ...RenderState.BlendOperationTokenList,
  ...RenderState.CompareFunctionTokenList,
  ...Object.values(RenderState.BlendStatePropertyTokens),
  ...Object.values(RenderState.BlendStatePropertyTokensWithoutIndex),
  ...RenderState.CullModeTokenList,
  ...Object.values(RenderState.StencilStatePropertyTokens),
  ...Object.values(RenderState.DepthStatePropertyTokens),
  RenderState.Enabled,
  ...Object.values(RenderState.RasterStatePropertyTokens),
  ...Object.values(RenderState.RenderStateTypeTokens),
  ...RenderState.StencilOperationTokenList,
  ...Keywords.tokenList,
  ...GLKeywords.variableTokenList,
  ...GLKeywords.funcTokenList,
  ...GLKeywords.macroTokenList,
  ...GLKeywords.otherTokenList,
  Others.Identifier
];
