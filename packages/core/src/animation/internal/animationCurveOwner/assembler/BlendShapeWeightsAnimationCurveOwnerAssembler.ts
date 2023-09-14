import { SkinnedMeshRenderer } from "../../../../mesh";
import { KeyframeValueType } from "../../../Keyframe";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class BlendShapeWeightsAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Float32Array> {
  private _skinnedMeshRenderer: SkinnedMeshRenderer[] = [];

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    owner.target.getComponents(SkinnedMeshRenderer, this._skinnedMeshRenderer);
  }

  getTargetValue(): Float32Array {
    return this._skinnedMeshRenderer[0].blendShapeWeights;
  }

  setTargetValue(value: Float32Array): void {
    const skinnedMeshRenderer = this._skinnedMeshRenderer;
    for (let i = 0; i < skinnedMeshRenderer.length; i++) {
      skinnedMeshRenderer[i].blendShapeWeights = value;
    }
  }
}

AnimationCurveOwner.registerAssembler(
  SkinnedMeshRenderer,
  "blendShapeWeights",
  BlendShapeWeightsAnimationCurveOwnerAssembler
);
