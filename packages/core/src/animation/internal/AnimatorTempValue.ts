import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";
/**
 * @internal
 */
export class AnimatorTempValue {
  vector2 = new Vector2();
  vector3 = new Vector3();
  vector4 = new Vector4();
  quaternion = new Quaternion();
  private _floatArray = new Float32Array();

  getFloatArray(length: number) {
    if (length > this._floatArray.length) {
      this._floatArray = new Float32Array(length);
    }
    return this._floatArray;
  }
}
