import { Entity } from "@alipay/o3-core";
import { AnimationClipType } from "../AnimationConst";
import { AnimationClip } from "../AnimationClip";

export class AnimationClipHandler {
  protected type: AnimationClipType;
  protected animClip: AnimationClip;
  protected entity: Entity;
  public currentTime: number;
  protected hasInit: boolean;
  enabled: boolean;
  id: number;
  constructor(id: number, type: AnimationClipType, entity: Entity, animClip: AnimationClip) {
    this.id = id;
    this.type = type;
    this.entity = entity;
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
  stop() {
    this.enabled = false;
  }
  reset() {
    this.animClip.removeHandler(this.id);
    this.hasInit = false;
  }
}
