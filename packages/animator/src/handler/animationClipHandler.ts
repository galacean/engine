import { Node } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";

export class AnimationClipHandler {
  protected type: AnimationClipType;
  protected animClip: AnimationClip;
  protected node: Node;
  public currentTime: number;
  constructor(type: AnimationClipType, node: Node, animClip: AnimationClip) {
    this.type = type;
    this.node = node;
    this.animClip = animClip;
    this.currentTime = 0;
  }

  init() {}
  update(deltaTime: number) {}
}
