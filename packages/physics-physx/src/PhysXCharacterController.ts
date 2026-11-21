import { ICharacterController } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXPhysicsMaterial } from "./PhysXPhysicsMaterial";
import { PhysXPhysicsScene } from "./PhysXPhysicsScene";

/**
 * Character controller in PhysX.
 * @remarks PhysX cannot remove a controller from a scene and add it back, so the native controller lives only while
 * the controller is in a scene and is rebuilt from the stored state when it enters one.
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
  private _isBox = false;
  private _radius = 0.5;
  private _height = 1;
  private _halfExtents = new Vector3(0.5, 0.5, 0.5);
  private _center = new Vector3();
  private _worldPosition = new Vector3();
  private _contactOffset = 0.02;
  private _collisionLayer = 0;
  private _isSceneQuery = true;
  private _stepOffset = 0.5;
  private _nonWalkableMode = 0;
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
  setCapsule(radius: number, height: number): void {
    const controller = this._isBox ? null : this._pxController;
    radius = Math.fround(radius);
    height = Math.fround(height);
    if (controller) {
      if (radius !== this._radius) controller.setRadius(radius);
      if (height !== this._height) controller.setHeight(height);
    }
    this._isBox = false;
    this._radius = radius;
    this._height = height;
    if (!controller) this._rebuild();
  }

  /**
   * {@inheritDoc ICharacterController.setBox }
   */
  setBox(halfExtents: Vector3): void {
    const controller = this._isBox ? this._pxController : null;
    const size = this._halfExtents;
    const x = Math.fround(halfExtents.x);
    const y = Math.fround(halfExtents.y);
    const z = Math.fround(halfExtents.z);
    if (controller) {
      if (y !== size.y) controller.setHalfHeight(y);
      if (x !== size.x) controller.setHalfSideExtent(x);
      if (z !== size.z) controller.setHalfForwardExtent(z);
    }
    this._isBox = true;
    size.set(x, y, z);
    if (!controller) this._rebuild();
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
   * {@inheritDoc ICharacterController.setIsSceneQuery }
   */
  setIsSceneQuery(value: boolean): void {
    this._isSceneQuery = value;
    this._pxController?.setSceneQueryEnabled(value);
  }

  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): number {
    return this._pxController?.move(disp, minDist, elapsedTime) ?? 0;
  }

  /**
   * {@inheritDoc ICharacterController.setWorldPosition }
   */
  setWorldPosition(position: Vector3, center: Vector3): void {
    this._worldPosition.copyFrom(position);
    this._center.copyFrom(center);
    const controller = this._pxController;
    if (controller) {
      // The query proxy can still be at the previous pose after move().
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
    if (pxController) {
      this._worldPosition.copyFrom(pxController.getPosition()).subtract(this._center);
    }
    position.copyFrom(this._worldPosition);
  }

  /**
   * {@inheritDoc ICharacterController.setStepOffset }
   */
  setStepOffset(offset: number): void {
    this._stepOffset = offset;
    this._pxController?.setStepOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setNonWalkableMode }
   */
  setNonWalkableMode(flag: number): void {
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
      // Refresh the target with the new orientation.
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

  private _rebuild(): void {
    // Rebuild even after a failed creation, so corrected geometry takes effect
    if (this._scene) {
      this.getWorldPosition(this._worldPosition);
      this._destroyPXController();
      this._createPXController();
    }
  }

  private _createPXController(): void {
    const physX = this._physXPhysics._physX;
    const scene = this._scene!;
    let desc: any;
    if (this._isBox) {
      const halfExtents = this._halfExtents;
      desc = new physX.PxBoxControllerDesc();
      desc.halfHeight = halfExtents.y;
      desc.halfSideExtent = halfExtents.x;
      desc.halfForwardExtent = halfExtents.z;
    } else {
      desc = new physX.PxCapsuleControllerDesc();
      desc.radius = this._radius;
      desc.height = this._height;
      desc.climbingMode = 1; // Constrained
    }
    // Create the proxy actor at its pose: setPosition only moves it in the next simulation
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
      // PhysX rejects invalid descriptors (non-positive extents, or stepOffset above the geometry allows)
      console.error("CharacterController: failed to create the controller, check its geometry and stepOffset.");
      return;
    }
    this._pxController = pxController;
    pxController.setUUID(this._id);
    pxController.setSceneQueryEnabled(this._isSceneQuery);
    const actor = pxController.getActor();
    physX.setGroup(actor, this._collisionLayer);
    actor.delete();
    scene._addColliderShape(this._id);
  }

  private _destroyPXController(): void {
    const pxController = this._pxController;
    if (pxController) {
      this._scene!._removeColliderShape(this._id);
      pxController.release();
      this._pxController = null;
    }
  }

  private _syncControllerPose(controller: any, position: Vector3): void {
    if (!controller.setPosition(position)) return;
    // Publish the target computed by PhysX on the proxy so scene queries see it immediately.
    const actor = controller.getActor();
    actor.setGlobalPose(actor.getKinematicTarget(), true);
    actor.delete();
  }
}
