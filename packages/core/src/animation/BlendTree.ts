import { AnimationClip } from "./AnimationClip";

export enum BlendTreeType {
  Simple2D
}

export class BlendTree {
  blendParameterX: string;
  blendParameterY: string;
  blendType: BlendTreeType;
  children: AnimationClip[];

  _transformClipToBlendTreeTarget(clip: AnimationClip) {}

  addChild(clip: AnimationClip) {}
  removeChild(index: number) {}
}
