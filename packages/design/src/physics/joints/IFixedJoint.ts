import { IJoint } from "./IJoint";
import { Vector3 } from "@oasis-engine/math";

/*
 A fixed joint permits no relative movement between two colliders. ie the colliders are glued together.
 */
export interface IFixedJoint extends IJoint {
  /**
   * Set fixed offset.
   * @param value - The offset
   */
  setOffset(value: Vector3): void;
}
