import { Node } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";

export class AnimationClipHandler {
  protected type: AnimationClipType;
  protected animClip: AnimationClip;
  protected node: Node;
  public currentTime: number;
  protected hasInit: boolean;
  enabled: boolean;
  id: number;
  constructor(id: number, type: AnimationClipType, node: Node, animClip: AnimationClip) {
    this.id = id;
    this.type = type;
    this.node = node;
    this.animClip = animClip;
    this.hasInit = false;
  }

  init() {
    this.currentTime = 0;
    this.enabled = true;
    this.animClip.addHandler(this.id, this);
  }
  play() {
    this.enabled = true;
  }
  update(deltaTime: number) {
    if (!this.hasInit) {
      this.init();
      this.hasInit = true;
    }
  }
  pause() {}
  stop() {
    this.enabled = false;
  }
  reset() {
    this.animClip.removeHandler(this.id);
    this.hasInit = false;
  }
}
