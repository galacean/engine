import { TokenUtils } from "../TokenUtils";
import { BlendFactor, BlendOperation } from "@galacean/engine";

const ColorBlendOperation = TokenUtils.createKeywordToken("ColorBlendOperation");
const AlphaBlendOperation = TokenUtils.createKeywordToken("AlphaBlendOperation");
const SrcColorBlendFactor = TokenUtils.createKeywordToken("SrcColorBlendFactor");
const SrcAlphaBlendFactor = TokenUtils.createKeywordToken("SrcAlphaBlendFactor");
const DestColorBlendFactor = TokenUtils.createKeywordToken("DestColorBlendFactor");
const DestAlphaBlendFactor = TokenUtils.createKeywordToken("DestAlphaBlendFactor");
const ColorWriteMask = TokenUtils.createKeywordToken("ColorWriteMask");
const BlendColor = TokenUtils.createKeywordToken("BlendColor");
const AlphaToCoverage = TokenUtils.createKeywordToken("AlphaToCoverage");

export const BlendStatePropertyTokens = {
  ColorBlendOperation,
  AlphaBlendOperation,
  SrcColorBlendFactor,
  SrcAlphaBlendFactor,
  DestColorBlendFactor,
  DestAlphaBlendFactor,
  ColorWriteMask,
  BlendColor,
  AlphaToCoverage
};

// BlendOperation
export const BlendOperationTokenList = TokenUtils.getEnumKeys(BlendOperation).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "BlendOperation")
);

// BlendFactor
export const BlendFactorTokenList = TokenUtils.getEnumKeys(BlendFactor).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "BlendFactor")
);
