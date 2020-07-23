import { Entity } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";

export class AnimationComponentHandler extends AnimationClipHandler {
  handler: any;
  type: AnimationClipType;
  animClip: AnimationClip;
  entity: Entity;
  currentTime: number;
  constructor(id: number, type: AnimationClipType, entity: Entity, animClip: AnimationClip) {
    super(id, type, entity, animClip);
  }
}

// updateAnimationComponent(handler, deltaTime) {
//   const { _handler } = handler;
//   if (_handler.animUpdate) {
//     _handler.animUpdate(deltaTime);
//   }
// }

// bindAnimationComponentAnimClip(animClip) {
//   const { animationComponentAbility } = animClip;
//   const { params } = animClip.options;
//   const animationComponent = this.node.addComponent(animationComponentAbility, params);
//   const handler = {
//     type: AnimationComponent,
//     _handler: animationComponent,
//     targetValue: null,
//     animClip
//   };
//   this.handlerList.push(handler);
//   return handler;
// }
