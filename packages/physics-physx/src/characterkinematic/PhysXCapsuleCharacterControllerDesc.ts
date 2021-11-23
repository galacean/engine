import { PhysXCharacterControllerDesc } from "./PhysXCharacterControllerDesc";
import { ICapsuleCharacterControllerDesc } from "@oasis-engine/design";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { Vector3 } from "oasis-engine";
import { ICharacterController, ICollider, IColliderShape, IPhysicsObstacle } from "@oasis-engine/design/src";

export class PhysXCapsuleCharacterControllerDesc
  extends PhysXCharacterControllerDesc
  implements ICapsuleCharacterControllerDesc
{
  constructor() {
    super();
    // this._pxControllerDesc = CPxCapsuleControllerDesc();
  }

  setToDefault() {
    this._pxControllerDesc.setToDefault();
  }

  setRadius(radius: number) {
    this._pxControllerDesc.radius = radius;
  }

  setHeight(height: number) {
    this._pxControllerDesc.height = height;
  }

  setClimbingMode(climbingMode: number) {
    // this._pxControllerDesc.climbingMode = CPxCapsuleClimbingMode(UInt32(climbingMode))
  }

  setPosition(position: Vector3) {
    this._pxControllerDesc.position = position;
  }

  setUpDirection(upDirection: Vector3) {
    this._pxControllerDesc.upDirection = upDirection;
  }

  setSlopeLimit(slopeLimit: number) {
    this._pxControllerDesc.slopeLimit = slopeLimit;
  }

  setInvisibleWallHeight(invisibleWallHeight: number) {
    this._pxControllerDesc.invisibleWallHeight = invisibleWallHeight;
  }

  setMaxJumpHeight(maxJumpHeight: number) {
    this._pxControllerDesc.maxJumpHeight = maxJumpHeight;
  }

  setContactOffset(contactOffset: number) {
    this._pxControllerDesc.contactOffset = contactOffset;
  }

  setStepOffset(stepOffset: number) {
    this._pxControllerDesc.stepOffset = stepOffset;
  }

  setDensity(density: number) {
    this._pxControllerDesc.density = density;
  }

  setScaleCoeff(scaleCoeff: number) {
    this._pxControllerDesc.scaleCoeff = scaleCoeff;
  }

  setVolumeGrowth(volumeGrowth: number) {
    this._pxControllerDesc.volumeGrowth = volumeGrowth;
  }

  setNonWalkableMode(nonWalkableMode: number) {
    // this._pxControllerDesc.nonWalkableMode = CPxControllerNonWalkableMode(UInt32(nonWalkableMode))
  }

  setMaterial(material?: PhysXPhysicsMaterial) {
    this._pxControllerDesc.material = material?._pxMaterial;
  }

  setRegisterDeletionListener(registerDeletionListener: boolean) {
    this._pxControllerDesc.registerDeletionListener = registerDeletionListener;
  }

  setControllerBehaviorCallback(
    getShapeBehaviorFlags: (shape: IColliderShape, collider: ICollider) => number,
    getControllerBehaviorFlags: (controller: ICharacterController) => number,
    getObstacleBehaviorFlags: (obstacle: IPhysicsObstacle) => number
  ): void {
    throw "";
  }
}
