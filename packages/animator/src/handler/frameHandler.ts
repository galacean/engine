import { Entity } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";

export class FrameHandler extends AnimationClipHandler {
  handler: any;
  type: AnimationClipType;
  animClip: AnimationClip;
  entity: Entity;
  currentTime: number;
  constructor(id: number, type: AnimationClipType, entity: Entity, animClip: AnimationClip) {
    super(id, type, entity, animClip);
  }
}
