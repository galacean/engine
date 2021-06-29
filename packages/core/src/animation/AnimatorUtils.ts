import { Vector3, Quaternion } from "@oasis-engine/math";

/**
 * @internal
 */
export class AnimatorUtils {
  private static _tempVector30: Vector3 = new Vector3();
  private static _tempVector31: Vector3 = new Vector3();

  static scaleWeight(s: Vector3, w: number, out: Vector3): void {
    const sX = s.x;
    const sY = s.y;
    const sZ = s.z;
    out.x = sX > 0 ? Math.pow(Math.abs(sX), w) : -Math.pow(Math.abs(sX), w);
    out.y = sY > 0 ? Math.pow(Math.abs(sY), w) : -Math.pow(Math.abs(sY), w);
    out.z = sZ > 0 ? Math.pow(Math.abs(sZ), w) : -Math.pow(Math.abs(sZ), w);
  }

  static scaleBlend(sa: Vector3, sb: Vector3, w: number, out: Vector3): void {
    const saw = AnimatorUtils._tempVector30;
    const sbw = AnimatorUtils._tempVector31;
    AnimatorUtils.scaleWeight(sa, 1.0 - w, saw);
    AnimatorUtils.scaleWeight(sb, w, sbw);
    const sng = w > 0.5 ? sb : sa;
    out.x = sng.x > 0 ? Math.abs(saw.x * sbw.x) : -Math.abs(saw.x * sbw.x);
    out.y = sng.y > 0 ? Math.abs(saw.y * sbw.y) : -Math.abs(saw.y * sbw.y);
    out.z = sng.z > 0 ? Math.abs(saw.z * sbw.z) : -Math.abs(saw.z * sbw.z);
  }

  static quaternionWeight(s: Quaternion, w: number, out: Quaternion) {
    out.x = s.x * w;
    out.y = s.y * w;
    out.z = s.z * w;
    out.w = s.w;
  }
}
