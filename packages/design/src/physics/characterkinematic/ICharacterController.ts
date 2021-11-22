import { Vector3 } from "@oasis-engine/math";

export interface ICharacterController {
  move(disp: Vector3, minDist: number, elapsedTime: number): number;

  isSetControllerCollisionFlag(flags: number, flag: number): boolean;

  setPosition(position: Vector3): boolean;

  setFootPosition(position: Vector3): void;

  setStepOffset(offset: number): void;

  setNonWalkableMode(flag: number): void;

  setContactOffset(offset: number): void;

  setUpDirection(up: Vector3): void;

  setSlopeLimit(slopeLimit: number): void;

  invalidateCache(): void;

  resize(height: number): void;

  /// Set unique id of the collider shape.
  setUniqueID(id: number): void;

  getPosition(position: Vector3): void;
}
