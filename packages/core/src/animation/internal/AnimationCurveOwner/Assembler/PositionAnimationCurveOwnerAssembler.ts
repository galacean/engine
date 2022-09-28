import { Vector3 } from "@oasis-engine/math";
import { Transform } from "../../../../Transform";
import { KeyframeTangentType, KeyframeValueType } from "../../../KeyFrame";
import { AnimationCurveOwner } from "../AnimationCurveOwner";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";

/**
 * @internal
 */
export class PositionAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Vector3> {
  private _transform: Transform;

  initialization(owner: AnimationCurveOwner<KeyframeTangentType, KeyframeValueType>): void {
    this._transform = owner.target.transform;
  }

  getValue(): Vector3 {
    return this._transform.position;
  }
  setValue(value: Vector3): void {
    this._transform.position = value;
  }
}

AnimationCurveOwner._registerAssemblerType(Transform, "position", PositionAnimationCurveOwnerAssembler);
