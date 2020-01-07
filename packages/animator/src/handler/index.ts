import { Node } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { InterpolationHandler } from "./interpolationHandler";
import { SkeltonHandler } from "./skeltonHandler";
import { AnimationComponentHandler } from "./animationComponentHandler";
const handlerMap = {
  [AnimationClipType.Interpolation]: InterpolationHandler,
  [AnimationClipType.Skelton]: SkeltonHandler,
  [AnimationClipType.AnimationComponent]: AnimationComponentHandler
};
export function getAnimationClipHander(node: Node, animClip: AnimationClip) {
  const { AnimationClipType: type } = animClip;
  return new handlerMap[type](type, node, animClip);
}
