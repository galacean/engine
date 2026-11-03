import { Quaternion, Vector3, type Transform } from "@galacean/engine";
import type { FarmItemType } from "../domain/FarmItems";

/** Camera-local idle correction. WorkMotion blends this pose into the unmodified world-space action. */
export class FarmItemLookDownPose {
  private readonly rotation = new Quaternion();
  private readonly result = new Quaternion();
  private readonly position = new Vector3();

  apply(transform: Transform, type: FarmItemType, forwardY: number, pickupWeight: number, portrait = false): void {
    if (type !== "hoe") return;
    const pitch = (Math.asin(Math.max(-1, Math.min(1, -forwardY))) * 180) / Math.PI;
    const t = Math.max(0, Math.min(1, (pitch - (portrait ? 15 : 25)) / 55));
    const weight = t * t * (3 - 2 * t) * pickupWeight;
    if (weight <= 0) return;
    // Approximate hand position, in camera space. Keep the grip close while raising the tool head.
    const pivotY = -0.25,
      pivotZ = -0.35;
    Quaternion.rotationEuler(((portrait ? 12 : 25) * weight * Math.PI) / 180, 0, 0, this.rotation);
    this.position.copyFrom(transform.position);
    this.position.y -= pivotY;
    this.position.z -= pivotZ;
    this.position.transformByQuat(this.rotation);
    this.position.y += pivotY + 0.02 * weight;
    this.position.z += pivotZ + 0.1 * weight;
    // Portrait carry sits farther out to fit the narrow viewport. Pull it back on look-down
    // instead of raising it out of frame; the work clip still owns the actual contact pose.
    if (portrait) this.position.z += Math.max(0, -0.95 - this.position.z) * weight;
    transform.position = this.position;
    Quaternion.multiply(this.rotation, transform.rotationQuaternion, this.result);
    transform.rotationQuaternion = this.result;
  }
}
