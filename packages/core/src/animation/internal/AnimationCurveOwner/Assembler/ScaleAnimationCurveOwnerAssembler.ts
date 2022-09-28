import { Vector3 } from "@oasis-engine/math";
import { Transform } from "../../../../Transform";
import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class ScaleAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Vector3> {
  private _transform: Transform;

  initialize(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void {
    this._transform = owner.target.transform;
  }
  getTargetValue(): Vector3 {
    return this._transform.scale;
  }
  setTargetValue(value: Vector3): void {
    this._transform.scale = value;
  }
}
AnimationCurveOwner._registerAssembler(Transform, "scale",ScaleAnimationCurveOwnerAssembler);