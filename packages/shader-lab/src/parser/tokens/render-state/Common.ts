import { TokenUtils } from "../TokenUtils";
import { CompareFunction } from "@galacean/engine";

export const Enabled = TokenUtils.createKeywordToken("Enabled");

export const CompareFunctionTokenList = TokenUtils.getEnumKeys(CompareFunction).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "CompareFunction")
);
