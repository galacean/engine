import { ICharacterControllerDesc } from "./ICharacterControllerDesc";
import { Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";
import { IColliderShape } from "../shape";
import { ICollider } from "../ICollider";
import { ICharacterController } from "./ICharacterController";
import { IPhysicsObstacle } from "./IPhysicsObstacle";

export interface ICapsuleCharacterControllerDesc extends ICharacterControllerDesc {
  setToDefault();

  setRadius(radius: number);

  setHeight(height: number);

  setClimbingMode(climbingMode: number);

  setPosition(position: Vector3);

  setUpDirection(upDirection: Vector3);

  setSlopeLimit(slopeLimit: number);

  setInvisibleWallHeight(invisibleWallHeight: number);

  setMaxJumpHeight(maxJumpHeight: number);

  setContactOffset(contactOffset: number);

  setStepOffset(stepOffset: number);

  setDensity(density: number);

  setScaleCoeff(scaleCoeff: number);

  setVolumeGrowth(volumeGrowth: number);

  setNonWalkableMode(nonWalkableMode: number);

  setMaterial(material?: IPhysicsMaterial);

  setRegisterDeletionListener(registerDeletionListener: boolean);

  setControllerBehaviorCallback(
    getShapeBehaviorFlags: (shape: IColliderShape, collider: ICollider) => number,
    getControllerBehaviorFlags: (controller: ICharacterController) => number,
    getObstacleBehaviorFlags: (obstacle: IPhysicsObstacle) => number
  );
}
