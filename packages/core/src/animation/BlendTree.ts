import { Entity } from "./../Entity";
import { Motion } from "./Motion";
import { AnimationClip } from "./AnimationClip";

export enum BlendTreeType {
  Simple2D
}

/**
 * TODO
 * Blend trees are used to blend continuously animation between their childs. They can either be 1D or 2D.
 */
export class BlendTree extends Motion {
  blendParameterX: string;
  blendParameterY: string;
  blendType: BlendTreeType;
  children: AnimationClip[];

  /**
   * @internal
   */
  _setTarget(target: Entity) {
    this._target = target;
  }
  _transformClipToBlendTreeTarget(clip: AnimationClip) {}

  addChild(clip: AnimationClip) {}
  removeChild(index: number) {}
}
