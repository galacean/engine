import { Entity } from "./../Entity";
import { Motion } from "./Motion";
import { AnimationClip } from "./AnimationClip";

export enum BlendTreeType {
  Simple2D
}

export class BlendTree extends Motion {
  blendParameterX: string;
  blendParameterY: string;
  blendType: BlendTreeType;
  children: AnimationClip[];

  /**
   * @internal
   */
  set target(target: Entity) {
    this._target = target;
  }
  _transformClipToBlendTreeTarget(clip: AnimationClip) {}

  addChild(clip: AnimationClip) {}
  removeChild(index: number) {}
}
