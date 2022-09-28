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

  initialization(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void {
    this._transform = owner.target.transform;
  }
  getValue(): Vector3 {
    return this._transform.scale;
  }
  setValue(value: Vector3): void {
    this._transform.scale = value;
  }
}
AnimationCurveOwner._registerAssemblerType(Transform, "scale",ScaleAnimationCurveOwnerAssembler);