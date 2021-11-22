import { ICharacterControllerDesc } from "./ICharacterControllerDesc";
import { Vector3 } from "@oasis-engine/math";
import { IPhysicsMaterial } from "../IPhysicsMaterial";
import { IColliderShape } from "../shape";
import { ICollider } from "../ICollider";
import { ICharacterController } from "./ICharacterController";
import { IPhysicsObstacle } from "./IPhysicsObstacle";

export interface ICapsuleCharacterControllerDesc extends ICharacterControllerDesc {
  setToDefault(): void;

  setRadius(radius: number): void;

  setHeight(height: number): void;

  setClimbingMode(climbingMode: number): void;

  setPosition(position: Vector3): void;

  setUpDirection(upDirection: Vector3): void;

  setSlopeLimit(slopeLimit: number): void;

  setInvisibleWallHeight(invisibleWallHeight: number): void;

  setMaxJumpHeight(maxJumpHeight: number): void;

  setContactOffset(contactOffset: number): void;

  setStepOffset(stepOffset: number): void;

  setDensity(density: number): void;

  setScaleCoeff(scaleCoeff: number): void;

  setVolumeGrowth(volumeGrowth: number): void;

  setNonWalkableMode(nonWalkableMode: number): void;

  setMaterial(material?: IPhysicsMaterial): void;

  setRegisterDeletionListener(registerDeletionListener: boolean): void;

  setControllerBehaviorCallback(
    getShapeBehaviorFlags: (shape: IColliderShape, collider: ICollider) => number,
    getControllerBehaviorFlags: (controller: ICharacterController) => number,
    getObstacleBehaviorFlags: (obstacle: IPhysicsObstacle) => number
  ): void;
}
