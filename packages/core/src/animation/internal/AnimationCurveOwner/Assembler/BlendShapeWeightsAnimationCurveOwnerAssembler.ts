import { SkinnedMeshRenderer } from "../../../../mesh";
import { KeyFrameTangentType, KeyFrameValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class BlendShapeWeightsAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Float32Array> {
  private _skinnedMeshRenderer: SkinnedMeshRenderer;

  initialization(owner: AnimationCurveOwner<KeyFrameTangentType, KeyFrameValueType>): void {
    this._skinnedMeshRenderer = owner.target.getComponent(SkinnedMeshRenderer);
  }

  getValue(): Float32Array {
    return this._skinnedMeshRenderer.blendShapeWeights;
  }
  setValue(value: Float32Array): void {
    this._skinnedMeshRenderer.blendShapeWeights = value;
  }
}

AnimationCurveOwner._registerAssemblerType(
  SkinnedMeshRenderer,
  "blendShapeWeights",
  BlendShapeWeightsAnimationCurveOwnerAssembler
);
