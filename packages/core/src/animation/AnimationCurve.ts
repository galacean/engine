import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";
// import { Vector2, Vector3, Vector4, Quaternion } from "../mat";
import { Keyframe } from "./KeyFrame";

export class AnimationCurve {
  keys: Keyframe[] = [];
  private _length: number = 0; //时间
  valueSize: number;
  get length() {
    return this._length;
  }

  addKey(time: number, value: number | Vector2 | Vector3 | Vector4 | Quaternion) {
    this.keys.push({
      inTangent: 1,
      outTangent: 1,
      time,
      value
    });
    if (time > this._length) {
      this._length = time;
    }
    this.valueSize = value.length || 1;
  }
  evaluate(time: number) {}
  moveKey(index: number, key: Keyframe) {}

  removeKey(index: number) {}
}
