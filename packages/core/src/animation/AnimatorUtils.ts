import { Vector3, Quaternion } from "@oasis-engine/math";

/**
 * @internal
 */
export class AnimatorUtils {
  static scaleWeight(s: Vector3, w: number, out: Vector3): void {
    const sX = s.x;
    const sY = s.y;
    const sZ = s.z;
    out.x = sX > 0 ? Math.pow(Math.abs(sX), w) : -Math.pow(Math.abs(sX), w);
    out.y = sY > 0 ? Math.pow(Math.abs(sY), w) : -Math.pow(Math.abs(sY), w);
    out.z = sZ > 0 ? Math.pow(Math.abs(sZ), w) : -Math.pow(Math.abs(sZ), w);
  }

  static quaternionWeight(s: Quaternion, w: number, out: Quaternion) {
    out.x = s.x * w;
    out.y = s.y * w;
    out.z = s.z * w;
    out.w = s.w;
  }
}
