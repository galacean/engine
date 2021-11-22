import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsObstacle } from "./IPhysicsObstacle";

export interface IPhysicsCapsuleObstacle extends IPhysicsObstacle {
  setPos(mPos: Vector3): void;

  setRot(mRot: Quaternion): void;

  setRadius(mRadius: number): void;

  setHalfHeight(mHalfHeight: number): void;
}
