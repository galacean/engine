import { Node } from "@alipay/o3-core";
import { AAnimation as SkeltonAnimation, WrapMode } from "@alipay/o3-animation";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";

export class SkeltonHandler extends AnimationClipHandler {
  actionName: string;
  skeltoAnimationRenderer: SkeltonAnimation;
  ownClip: boolean;
  constructor(id: number, type: AnimationClipType, node: Node, animClip: AnimationClip) {
    super(id, type, node, animClip);
  }

  init() {
    super.init();
    const { node, animClip } = this;
    //骨骼动画解绑之前所有的控制器
    animClip.removeAllHandler();
    animClip.addHandler(this.id, this);
    this.enabled = true;
    this.actionName = animClip.skeltonAnim.name;
    const skeltoAnimationRenderer = (this.skeltoAnimationRenderer =
      node.getComponent(SkeltonAnimation) || node.addComponent(SkeltonAnimation));
    skeltoAnimationRenderer.enabled = false;
    skeltoAnimationRenderer.addAnimationClip(animClip.skeltonAnim, this.actionName);
    this.skeltoAnimationRenderer.playAnimationClip(this.actionName, {
      wrapMode: WrapMode.ONCE
    });
  }
  play() {
    super.play();
    this.skeltoAnimationRenderer.enabled = false;
  }

  update(deltaTime) {
    super.update(deltaTime);
    const { animClip } = this;
    if (!this.enabled) return;
    this.currentTime += deltaTime;
    this.skeltoAnimationRenderer.jumpToFrame(this.currentTime);
  }

  stop() {
    super.stop();
    if (!this.skeltoAnimationRenderer) return;
    this.skeltoAnimationRenderer.removeAnimationClip(this.actionName);
    this.skeltoAnimationRenderer.enabled = true;
    this.ownClip = false;
  }

  reset() {
    super.reset();
    this.ownClip = false;
  }
}
