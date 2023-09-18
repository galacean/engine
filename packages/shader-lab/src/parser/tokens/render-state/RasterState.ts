import { TokenUtils } from "../TokenUtils";
import { CullMode as ECullMode } from "@galacean/engine";

const CullMode = TokenUtils.createKeywordToken("CullMode");
const DepthBias = TokenUtils.createKeywordToken("DepthBias");
const SlopeScaledDepthBias = TokenUtils.createKeywordToken("SlopeScaledDepthBias");
export const RasterStatePropertyTokens = { CullMode, DepthBias, SlopeScaledDepthBias };

export const CullModeTokenList = TokenUtils.getEnumKeys(ECullMode).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "CullMode")
);
