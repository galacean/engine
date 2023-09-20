import { TokenUtils } from "../TokenUtils";
import { StencilOperation } from "@galacean/engine";

const ReferenceValue = TokenUtils.createKeywordToken("ReferenceValue");
const Mask = TokenUtils.createKeywordToken("Mask");
const WriteMask = TokenUtils.createKeywordToken("WriteMask");
const CompareFunctionFront = TokenUtils.createKeywordToken("CompareFunctionFront");
const CompareFunctionBack = TokenUtils.createKeywordToken("CompareFunctionBack");
const PassOperationFront = TokenUtils.createKeywordToken("PassOperationFront");
const PassOperationBack = TokenUtils.createKeywordToken("PassOperationBack");
const FailOperationFront = TokenUtils.createKeywordToken("FailOperationFront");
const FailOperationBack = TokenUtils.createKeywordToken("FailOperationBack");
const ZFailOperationFront = TokenUtils.createKeywordToken("ZFailOperationFront");
const ZFailOperationBack = TokenUtils.createKeywordToken("ZFailOperationBack");
export const StencilStatePropertyTokens = {
  ReferenceValue,
  Mask,
  WriteMask,
  CompareFunctionFront,
  CompareFunctionBack,
  PassOperationFront,
  PassOperationBack,
  FailOperationFront,
  FailOperationBack,
  ZFailOperationFront,
  ZFailOperationBack
};

export const StencilOperationTokenList = TokenUtils.getEnumKeys(StencilOperation).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "StencilOperation")
);
