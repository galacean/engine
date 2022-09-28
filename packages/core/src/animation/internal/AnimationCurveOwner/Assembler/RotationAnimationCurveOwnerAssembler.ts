import { Quaternion } from "@oasis-engine/math";
import { KeyFrameTangentType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class RotationAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Quaternion> {
  getValue(owner: AnimationCurveOwner<KeyFrameTangentType, Quaternion>): Quaternion {
    return owner.target.transform.rotationQuaternion;
  }
  setValue(owner: AnimationCurveOwner<KeyFrameTangentType, Quaternion>, value: Quaternion): void {
    owner.target.transform.rotationQuaternion = value;
  }
}
