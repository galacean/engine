import { Node } from "@alipay/o3-core";
import { AAnimation as SkeltonAnimation } from "@alipay/o3-animation";
import { vec3 } from "@alipay/o3-math";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationClipType;

export class SkeltonHandler extends AnimationClipHandler {
  actionName: string;
  skeltoAnimationRenderer: SkeltonAnimation;
  constructor(type: AnimationClipType, node: Node, animClip: AnimationClip) {
    super(type, node, animClip);
    this.init();
  }

  init() {
    const { node, animClip } = this;
    this.actionName = animClip.skeltonAnim.name;
    const skeltoAnimationRenderer = (this.skeltoAnimationRenderer =
      node.findAbilityByType(SkeltonAnimation) || node.createAbility(SkeltonAnimation));
    if (!skeltoAnimationRenderer._animSet[this.actionName]) {
      skeltoAnimationRenderer.addAnimationClip(animClip.skeltonAnim, this.actionName);
    }
  }
  update(deltaTime) {
    if (!this.skeltoAnimationRenderer.isPlaying()) {
      this.skeltoAnimationRenderer.playAnimationClip(this.actionName, {});
    }
  }
}
