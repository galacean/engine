import { Vector3, Quaternion } from "@oasis-engine/math";

export class AnimatorUtils {
  /**
   * @internal
   */
  static calScaleWeight(s: Vector3, w: number, out: Vector3): void {
    const sX: number = s.x,
      sY: number = s.y,
      sZ: number = s.z;
    out.x = sX > 0 ? Math.pow(Math.abs(sX), w) : -Math.pow(Math.abs(sX), w);
    out.y = sY > 0 ? Math.pow(Math.abs(sY), w) : -Math.pow(Math.abs(sY), w);
    out.z = sZ > 0 ? Math.pow(Math.abs(sZ), w) : -Math.pow(Math.abs(sZ), w);
  }

  static calQuaternionWeight(s: Quaternion, w: number, out: Quaternion) {
    out.x = s.x * w;
    out.y = s.y * w;
    out.z = s.z * w;
  }
}
