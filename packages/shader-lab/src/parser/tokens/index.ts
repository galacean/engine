import * as Keywords from "./Keyword";
import * as Symbols from "./Symbol";
import * as EditorTypes from "./EditorTypes";
import * as Types from "./GLSLTypes";
import * as GLKeywords from "./GLSLKeywords";
import * as Others from "./Other";
import * as Values from "./Value";
import * as RenderState from "./render-state";

export { Keywords, Symbols, EditorTypes, Types, GLKeywords, Others, Values, RenderState };

export const _allTokens = [
  Others.WhiteSpace,
  Others.CommentLine,
  Others.CommentMultiLine,
  ...Symbols.RelationTokenList,
  ...Symbols.tokenList,
  ...Values.tokenList,
  ...Types.tokenList,
  ...Types.precisionTokenList,
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
  // ...GLKeywords.variableTokenList,
  ...GLKeywords.funcTokenList,
  ...GLKeywords.macroTokenList,
  ...GLKeywords.otherTokenList,
  Others.Identifier
];
