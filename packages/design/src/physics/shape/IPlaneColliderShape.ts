import { IColliderShape } from "./IColliderShape";
import { Vector3 } from "@oasis-engine/math";

/**
 * Interface of physical shape for plane
 */
export interface IPlaneColliderShape extends IColliderShape {
  /** set local rotation */
  setRotation(normal: Vector3): void;
}
