import { Vector3 } from "@oasis-engine/math";

export interface ICharacterController {
  move(disp: Vector3, minDist: number, elapsedTime: number): number;

  isSetControllerCollisionFlag(flags: number, flag: number): boolean;

  setPosition(position: Vector3): boolean;

  setFootPosition(position: Vector3);

  setStepOffset(offset: number);

  setNonWalkableMode(flag: number);

  setContactOffset(offset: number);

  setUpDirection(up: Vector3);

  setSlopeLimit(slopeLimit: number);

  invalidateCache();

  resize(height: number);

  /// Set unique id of the collider shape.
  setUniqueID(id: number);

  getPosition(position: Vector3);
}
