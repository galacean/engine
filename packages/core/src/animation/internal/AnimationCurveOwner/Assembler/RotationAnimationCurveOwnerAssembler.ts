import { Quaternion } from "@oasis-engine/math";
import { Transform } from "../../../../Transform";
import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class RotationAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Quaternion> {
  private _transform: Transform;

  initialization(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void {
    this._transform = owner.target.transform;
  }

  getValue(): Quaternion {
    return this._transform.rotationQuaternion;
  }
  setValue(value: Quaternion): void {
    this._transform.rotationQuaternion = value;
  }
}

AnimationCurveOwner._registerAssemblerType(Transform, "rotationQuaternion", RotationAnimationCurveOwnerAssembler);
