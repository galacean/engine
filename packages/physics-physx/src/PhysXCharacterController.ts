import {
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  ICharacterController,
  CharacterControllerOptions
} from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine";
import { PhysXPhysicsMaterial } from "./PhysXPhysicsMaterial";
import type { PhysXPhysicsScene } from "./PhysXPhysicsScene";

/**
 * PhysX capsule controller attached to a scene.
 */
export class PhysXCharacterController implements ICharacterController {
  /** @internal */
  static _create(
    scene: PhysXPhysicsScene,
    physX: any,
    manager: any,
    options: CharacterControllerOptions
  ): PhysXCharacterController | null {
    const radius = Math.fround(options.radius);
    const height = PhysXCharacterController._getNativeHeight(radius, options.halfHeight);
    const stepOffset = PhysXCharacterController._getNativeStepOffset(radius, height, options.stepOffset);
    const desc = new physX.PxCapsuleControllerDesc();
    desc.radius = radius;
    desc.height = height;
    desc.climbingMode = physX.PxCapsuleClimbingMode.eCONSTRAINED;
    desc.position = options.position;
    desc.upDirection = options.upDirection;
    desc.setMaterial((options.material as PhysXPhysicsMaterial)._pxMaterial);
    desc.contactOffset = options.contactOffset;
    desc.stepOffset = stepOffset;
    desc.slopeLimit = Math.cos((options.slopeLimit * Math.PI) / 180);
    desc.setNonWalkableMode(options.nonWalkableMode);
    const pxController = manager.createController(desc);
    desc.delete();

    if (!pxController) {
      console.error("CharacterController: failed to create the controller, check its geometry and stepOffset.");
      return null;
    }
    const id = options.uniqueID;
    pxController.setUUID(id);
    const controller = new PhysXCharacterController(scene, physX, pxController, id, radius, height, stepOffset);
    options.collisionLayer !== 0 && controller.setCollisionLayer(options.collisionLayer);
    scene._addShape(id);
    return controller;
  }

  private static _getNativeHeight(radius: number, halfHeight: number): number {
    // PhysX needs a positive cylinder height, including after the proxy scales it.
    return Math.max(Math.fround(halfHeight * 2), Math.fround(Math.max(radius * 1e-4, 3e-38)));
  }

  private static _getNativeStepOffset(radius: number, height: number, stepOffset: number): number {
    const totalHeight = Math.fround(height + Math.fround(radius * 2));
    return Math.min(Math.fround(stepOffset), totalHeight, 3.4028234663852886e38);
  }

  private constructor(
    private readonly _scene: PhysXPhysicsScene,
    private readonly _physX: any,
    private readonly _pxController: any,
    private readonly _id: number,
    private _radius: number,
    private _height: number,
    private _stepOffset: number
  ) {}

  /**
   * {@inheritDoc ICharacterController.setCapsule }
   */
  setCapsule(radius: number, halfHeight: number, stepOffset: number): void {
    radius = Math.fround(radius);
    const height = PhysXCharacterController._getNativeHeight(radius, halfHeight);
    stepOffset = PhysXCharacterController._getNativeStepOffset(radius, height, stepOffset);
    const controller = this._pxController;
    radius !== this._radius && controller.setRadius(radius);
    height !== this._height && controller.setHeight(height);
    stepOffset !== this._stepOffset && controller.setStepOffset(stepOffset);
    this._radius = radius;
    this._height = height;
    this._stepOffset = stepOffset;
  }

  /**
   * {@inheritDoc ICharacterController.setContactOffset }
   */
  setContactOffset(offset: number): void {
    this._pxController.setContactOffset(offset);
  }

  /**
   * {@inheritDoc ICharacterController.setMaterial }
   */
  setMaterial(material: PhysXPhysicsMaterial): void {
    this._pxController.setMaterial(material._pxMaterial);
  }

  /**
   * {@inheritDoc ICharacterController.setCollisionLayer }
   */
  setCollisionLayer(layer: number): void {
    const actor = this._pxController.getActor();
    this._physX.setGroup(actor, layer);
    actor.delete();
  }

  /**
   * {@inheritDoc ICharacterController.move }
   */
  move(disp: Vector3, minDist: number, elapsedTime: number): ControllerCollisionFlag {
    return this._pxController.move(disp, minDist, elapsedTime, false);
  }

  /**
   * {@inheritDoc ICharacterController.setPosition }
   */
  setPosition(position: Vector3): void {
    const controller = this._pxController;
    if (!controller.setPosition(position)) return;
    // Apply the kinematic target immediately so queries see the updated pose before the next step.
    const actor = controller.getActor();
    actor.setGlobalPose(actor.getKinematicTarget(), true);
    actor.delete();
  }

  /**
   * {@inheritDoc ICharacterController.getPosition }
   */
  getPosition(position: Vector3): void {
    position.copyFrom(this._pxController.getPosition());
  }

  /**
   * {@inheritDoc ICharacterController.setNonWalkableMode }
   */
  setNonWalkableMode(flag: ControllerNonWalkableMode): void {
    this._pxController.setNonWalkableMode(flag);
  }

  /**
   * {@inheritDoc ICharacterController.setUpDirection }
   */
  setUpDirection(up: Vector3): void {
    const controller = this._pxController;
    controller.setUpDirection(up);
    // Changing the up direction leaves the query proxy at its prior orientation.
    this.setPosition(controller.getPosition());
  }

  /**
   * {@inheritDoc ICharacterController.setSlopeLimit }
   */
  setSlopeLimit(slopeLimit: number): void {
    this._pxController.setSlopeLimit(Math.cos((slopeLimit * Math.PI) / 180));
  }

  /**
   * {@inheritDoc ICharacterController.destroy }
   */
  destroy(): void {
    this._scene._removeShape(this._id);
    this._pxController.release();
  }
}
