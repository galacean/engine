import { TokenUtils } from "../TokenUtils";

const BlendState = TokenUtils.createKeywordToken("BlendState");
const DepthState = TokenUtils.createKeywordToken("DepthState");
const StencilState = TokenUtils.createKeywordToken("StencilState");
const RasterState = TokenUtils.createKeywordToken("RasterState");

export const RenderStateTypeTokens = { BlendState, DepthState, StencilState, RasterState };
