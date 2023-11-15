import { RenderQueueType as ERenderQueueType } from "@galacean/engine";
import { TokenUtils } from "../TokenUtils";

export const RenderQueueTypeTokenList = TokenUtils.getEnumKeys(ERenderQueueType).map((item) =>
  TokenUtils.createKeywordTokenWithPrefix(item, "RenderQueueType")
);

export const RenderQueueType = TokenUtils.createKeywordToken("RenderQueueType");
