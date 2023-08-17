import { TokenUtils } from "../TokenUtils";
import { BlendFactor, BlendOperation } from "@galacean/engine";

const ColorBlendOperation = TokenUtils.createKeywordToken("ColorBlendOperation");
const AlphaBlendOperation = TokenUtils.createKeywordToken("AlphaBlendOperation");
const SourceColorBlendFactor = TokenUtils.createKeywordToken("SourceColorBlendFactor");
const SourceAlphaBlendFactor = TokenUtils.createKeywordToken("SourceAlphaBlendFactor");
const DestinationColorBlendFactor = TokenUtils.createKeywordToken("DestinationColorBlendFactor");
const DestinationAlphaBlendFactor = TokenUtils.createKeywordToken("DestinationAlphaBlendFactor");
const ColorWriteMask = TokenUtils.createKeywordToken("ColorWriteMask");
const BlendColor = TokenUtils.createKeywordToken("BlendColor");
const AlphaToCoverage = TokenUtils.createKeywordToken("AlphaToCoverage");

export const BlendStatePropertyTokens = {
  ColorBlendOperation,
  AlphaBlendOperation,
  SourceColorBlendFactor,
  SourceAlphaBlendFactor,
  DestinationColorBlendFactor,
  DestinationAlphaBlendFactor,
  ColorWriteMask
};

export const BlendStatePropertyTokensWithoutIndex = { BlendColor, AlphaToCoverage };

// BlendOperation
export const BlendOperationTokenList = TokenUtils.getEnumKeys(BlendOperation).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "BlendOperation")
);

// BlendFactor
export const BlendFactorTokenList = TokenUtils.getEnumKeys(BlendFactor).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "BlendFactor")
);
