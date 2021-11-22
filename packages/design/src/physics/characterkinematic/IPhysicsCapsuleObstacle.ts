import { Quaternion, Vector3 } from "@oasis-engine/math";
import { IPhysicsObstacle } from "./IPhysicsObstacle";

export interface IPhysicsCapsuleObstacle extends IPhysicsObstacle {
  setPos(mPos: Vector3);

  setRot(mRot: Quaternion);

  setRadius(mRadius: number);

  setHalfHeight(mHalfHeight: number);
}
