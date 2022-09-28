import { Vector3 } from "@oasis-engine/math";
import { KeyFrameTangentType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class PositionAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Vector3> {
  getValue(owner: AnimationCurveOwner<KeyFrameTangentType, Vector3>): Vector3 {
    return owner.target.transform.position;
  }
  setValue(owner: AnimationCurveOwner<KeyFrameTangentType, Vector3>, value: Vector3): void {
    owner.target.transform.position = value;
  }
}
