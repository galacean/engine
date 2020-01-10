import { Node } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { InterpolationHandler } from "./interpolationHandler";
import { SkeltonHandler } from "./skeletonHandler";
import { AnimationComponentHandler } from "./animationComponentHandler";
const handlerMap = {
  [AnimationClipType.Interpolation]: InterpolationHandler,
  [AnimationClipType.Skeleton]: SkeltonHandler,
  [AnimationClipType.AnimationComponent]: AnimationComponentHandler
};
let maxId = 0;
export function getAnimationClipHander(node: Node, animClip: AnimationClip) {
  const { AnimationClipType: type } = animClip;
  return new handlerMap[type](++maxId, type, node, animClip);
}
