import { Vector3 } from "@galacean/engine-math";
import { Transform } from "../../../../Transform";
import { KeyframeValueType } from "../../../Keyframe";
import { IAnimationCurveOwnerAssembler } from "./IAnimationCurveOwnerAssembler";
import type { AnimationCurveOwner } from "../AnimationCurveOwner";

/**
 * @internal
 */
export class PositionAnimationCurveOwnerAssembler implements IAnimationCurveOwnerAssembler<Vector3> {
  private _transform: Transform;

  initialize(owner: AnimationCurveOwner<KeyframeValueType>): void {
    this._transform = owner.target.transform;
  }

  getTargetValue(): Vector3 {
    return this._transform.position;
  }
  setTargetValue(value: Vector3): void {
    this._transform.position = value;
  }
}
