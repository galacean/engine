import { Node } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { AnimationClipType } from "../AnimationConst";
import { Tween, doTransform, Easing } from "@alipay/o3-tween";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationClipType;

export class FrameHandler extends AnimationClipHandler {
  handler: any;
  type: AnimationClipType;
  animClip: AnimationClip;
  node: Node;
  currentTime: number;
  constructor(id: number, type: AnimationClipType, node: Node, animClip: AnimationClip) {
    super(id, type, node, animClip);
  }
}
