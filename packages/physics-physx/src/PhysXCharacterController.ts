import { ControllerCollisionFlag, ControllerNonWalkableMode, ICharacterController } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsMaterial } from "./PhysXPhysicsMaterial";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";

/**
 * PhysX character controller with settings that persist across scene removal.
 * @remarks The scene’s controller manager creates the native controller on entry and releases it on removal.
 */
export class PhysXCharacterController implements ICharacterController {
  private static _tempVec = new Vector3();

  /** @internal */
  _id: number;
  /** @internal */
  _pxController: any = null;

  private _physXPhysics: PhysXPhysics;
  private _scene: PhysXPhysicsScene | null = null;
  private _pxMaterial: any;
  private _radius = 0.5;
  private _height = 1;
  private _center = new Vector3();
  private _worldPosition = new Vector3();
  private _contactOffset = 0.02;
  private _collisionLayer = 0;
  private _stepOffset = 0.5;
  private _nonWalkableMode: ControllerNonWalkableMode = ControllerNonWalkableMode.PreventClimbing;
  private _upDirection = new Vector3(0, 1, 0);
  private _slopeLimit = 45;

  constructor(physXPhysics: PhysXPhysics, uniqueID: number, material: PhysXPhysicsMaterial) {
    this._physXPhysics = physXPhysics;
    this._id = uniqueID;
    this._pxMaterial = material._pxMaterial;
  }

  /**
   * {@inheritDoc ICharacterController.setCapsule }
   */
  setCapsule(radius: number, halfHeight: number, stepOffset: number): void {
    radius = Math.fround(radius);
    const height = Math.fround(halfHeight * 2);
    // PhysX 4.1 rejects zero cylinder height and scales proxy halfHeight by 0.4; keep a tiny radius-relative floor.
    const minHeight = Math.fround(Math.max(radius * 1e-4, 3e-38));
    const nativeHeight = height > minHeight ? height : minHeight;
    const maxStepOffset = Math.fround(nativeHeight + Math.fround(radius * 2));
    const nativeStepOffset = Math.min(Math.fround(stepOffset), maxStepOffset, 3.4028234663852886e38);
    const controller = this._pxController;
    if (controller) {
      radius !== this._radius && controller.setRadius(radius);
      nativeHeight !== this._height && controller.setHeight(nativeHeight);
      nativeStepOffset !== this._stepOffset && controller.setStepOffset(nativeStepOffset);
    }
    this._radius = radius;
    this._height = nativeHeight;
    this._stepOffset = nativeStepOffset;
  }

  /**
   * {@inheritDoc ICharacterController.setContactOffset }
   */
  setContactOffset(offset: number): void {
    this._contactOffset = offset;
    this._pxController?.setContactOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setMaterial }
   */
  setMaterial(material: PhysXPhysicsMaterial): void {
    const pxMaterial = material._pxMaterial;
    this._pxMaterial = pxMaterial;
    this._pxController?.setMaterial(pxMaterial);
  }

  /**
   * {@inheritDoc ICharacterController.setCollisionLayer }
   */
  setCollisionLayer(layer: number): void {
    this._collisionLayer = layer;
    const controller = this._pxController;
    if (controller) {
      const actor = controller.getActor();
      this._physXPhysics._physX.setGroup(actor, layer);
      actor.delete();
    }
  }

  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): ControllerCollisionFlag {
    return this._pxController?.move(disp, minDist, elapsedTime, false) ?? ControllerCollisionFlag.None;
  }

  /**
   * {@inheritDoc ICharacterController.setWorldPosition }
   */
  setWorldPosition(position: Vector3, center: Vector3): void {
    this._worldPosition.copyFrom(position);
    this._center.copyFrom(center);
    const controller = this._pxController;
    if (controller) {
      const posePosition = PhysXCharacterController._tempVec;
      Vector3.add(position, center, posePosition);
      this._syncControllerPose(controller, posePosition);
    }
  }

  /**
   * {@inheritDoc ICharacterController.getWorldPosition }
   */
  getWorldPosition(position: Vector3): void {
    const pxController = this._pxController;
    pxController && this._worldPosition.copyFrom(pxController.getPosition()).subtract(this._center);
    position.copyFrom(this._worldPosition);
  }

  /**
   * {@inheritDoc ICharacterController.setNonWalkableMode }
   */
  setNonWalkableMode(flag: ControllerNonWalkableMode): void {
    this._nonWalkableMode = flag;
    this._pxController?.setNonWalkableMode(flag);
  }

  /**
   * {@inheritDoc ICharacterController.setUpDirection }
   */
  setUpDirection(up: Vector3): void {
    this._upDirection.copyFrom(up);
    const controller = this._pxController;
    if (controller) {
      controller.setUpDirection(up);
      // Changing the up direction leaves the query proxy at its prior orientation.
      this._syncControllerPose(controller, controller.getPosition());
    }
  }

  /**
   * {@inheritDoc ICharacterController.setSlopeLimit }
   */
  setSlopeLimit(slopeLimit: number): void {
    this._slopeLimit = slopeLimit;
    this._pxController?.setSlopeLimit(Math.cos((slopeLimit * Math.PI) / 180));
  }

  /**
   * {@inheritDoc ICharacterController.destroy }
   */
  destroy(): void {
    this._scene?.removeCharacterController(this);
  }

  /**
   * @internal
   */
  _addToScene(scene: PhysXPhysicsScene): void {
    this._scene = scene;
    this._createPXController();
  }

  /**
   * @internal
   */
  _removeFromScene(): void {
    this._destroyPXController();
    this._scene = null;
  }

  private _createPXController(): void {
    const physX = this._physXPhysics._physX;
    const scene = this._scene!;
    const desc = new physX.PxCapsuleControllerDesc();
    desc.radius = this._radius;
    desc.height = this._height;
    desc.climbingMode = physX.PxCapsuleClimbingMode.eCONSTRAINED;
    // Set the initial descriptor position so queries see the correct pose before the first step.
    const position = PhysXCharacterController._tempVec;
    Vector3.add(this._worldPosition, this._center, position);
    desc.position = position;
    desc.upDirection = this._upDirection;
    desc.setMaterial(this._pxMaterial);
    desc.contactOffset = this._contactOffset;
    desc.stepOffset = this._stepOffset;
    desc.slopeLimit = Math.cos((this._slopeLimit * Math.PI) / 180);
    desc.setNonWalkableMode(this._nonWalkableMode);
    const pxController = scene._getControllerManager().createController(desc);
    desc.delete();

    if (!pxController) {
      console.error("CharacterController: failed to create the controller, check its geometry and stepOffset.");
      return;
    }
    this._pxController = pxController;
    pxController.setUUID(this._id);
    const actor = pxController.getActor();
    physX.setGroup(actor, this._collisionLayer);
    actor.delete();
  }

  private _destroyPXController(): void {
    const pxController = this._pxController;
    if (pxController) {
      this._scene!._removeShape(this._id);
      pxController.release();
      this._pxController = null;
    }
  }

  private _syncControllerPose(controller: any, position: Vector3): void {
    if (!controller.setPosition(position)) return;
    // Apply the kinematic target immediately so queries see the updated pose before the next step.
    const actor = controller.getActor();
    actor.setGlobalPose(actor.getKinematicTarget(), true);
    actor.delete();
  }
}
