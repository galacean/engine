import { IPhysicsCapsuleObstacle, IPhysicsObstacle } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "oasis-engine";

export class PhysXObstacle implements IPhysicsObstacle {
  /** @internal */
  _pxObstacle: any;

  getType(): number {
    return this._pxObstacle.getType();
  }
}

class PhysXCapsuleObstacle extends PhysXObstacle implements IPhysicsCapsuleObstacle {
  constructor() {
    super();
    // this._pxObstacle = CPxCapsuleObstacle()
  }

  setPos(mPos: Vector3) {
    this._pxObstacle.mPos = mPos;
  }

  setRot(mRot: Quaternion) {
    this._pxObstacle.mRot = mRot;
  }

  setRadius(mRadius: number) {
    this._pxObstacle.mRadius = mRadius;
  }

  setHalfHeight(mHalfHeight: number) {
    this._pxObstacle.mHalfHeight = mHalfHeight;
  }
}