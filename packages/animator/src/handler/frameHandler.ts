import { Node } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";

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
