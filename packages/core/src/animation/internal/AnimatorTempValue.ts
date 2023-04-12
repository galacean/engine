import { Vector2, Vector3, Vector4, Quaternion } from "@galacean/engine-math";
/**
 * @internal
 */
export class AnimatorTempValue {
  vector2 = new Vector2();
  vector3 = new Vector3();
  vector4 = new Vector4();
  quaternion = new Quaternion();
  private _floatArrayPool: Float32Array[] = [];

  getFloatArray(length: number): Float32Array {
    let floatArray = this._floatArrayPool[length];
    if (!floatArray) {
      this._floatArrayPool[length] = floatArray = new Float32Array(length);
    }
    return floatArray;
  }
}
