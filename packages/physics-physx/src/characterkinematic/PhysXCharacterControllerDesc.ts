import { ICharacterControllerDesc } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * Descriptor class for a character controller.
 */
export class PhysXCharacterControllerDesc implements ICharacterControllerDesc {
  /** @internal */
  _pxControllerDesc: any;

  /**
   * {@inheritDoc ICharacterControllerDesc.getType }
   */
  getType(): number {
    return this._pxControllerDesc.getType();
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setPosition }
   */
  setPosition(position: Vector3) {
    this._pxControllerDesc.position = position;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setUpDirection }
   */
  setUpDirection(upDirection: Vector3) {
    this._pxControllerDesc.upDirection = upDirection;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setSlopeLimit }
   */
  setSlopeLimit(slopeLimit: number) {
    this._pxControllerDesc.slopeLimit = slopeLimit;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setInvisibleWallHeight }
   */
  setInvisibleWallHeight(invisibleWallHeight: number) {
    this._pxControllerDesc.invisibleWallHeight = invisibleWallHeight;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setMaxJumpHeight }
   */
  setMaxJumpHeight(maxJumpHeight: number) {
    this._pxControllerDesc.maxJumpHeight = maxJumpHeight;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setContactOffset }
   */
  setContactOffset(contactOffset: number) {
    this._pxControllerDesc.contactOffset = contactOffset;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setStepOffset }
   */
  setStepOffset(stepOffset: number) {
    this._pxControllerDesc.stepOffset = stepOffset;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setDensity }
   */
  setDensity(density: number) {
    this._pxControllerDesc.density = density;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setScaleCoeff }
   */
  setScaleCoeff(scaleCoeff: number) {
    this._pxControllerDesc.scaleCoeff = scaleCoeff;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setVolumeGrowth }
   */
  setVolumeGrowth(volumeGrowth: number) {
    this._pxControllerDesc.volumeGrowth = volumeGrowth;
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setNonWalkableMode }
   */
  setNonWalkableMode(nonWalkableMode: number) {
    this._pxControllerDesc.setNonWalkableMode(nonWalkableMode);
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setMaterial }
   */
  setMaterial(material?: PhysXPhysicsMaterial) {
    this._pxControllerDesc.setMaterial(material?._pxMaterial);
  }

  /**
   * {@inheritDoc ICharacterControllerDesc.setRegisterDeletionListener }
   */
  setRegisterDeletionListener(registerDeletionListener: boolean) {
    this._pxControllerDesc.registerDeletionListener = registerDeletionListener;
  }
}
