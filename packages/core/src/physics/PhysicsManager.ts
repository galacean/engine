import { HitResult } from "./HitResult";
import { Ray } from "@oasis-engine/math";
import { ICharacterControllerManager, IPhysics, IPhysicsManager } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Layer } from "../Layer";
import { ColliderShape } from "./shape";
import { CharacterController } from "./characterkinematic";
import { Entity } from "../Entity";

export type TriggerObject = ColliderShape | CharacterController;

function getEntity(object: TriggerObject): Entity {
  if (object instanceof ColliderShape) {
    return object.collider.entity;
  } else {
    return object.entity;
  }
}

/**
 * A physics manager is a collection of bodies and constraints which can interact.
 */
export class PhysicsManager {
  /** @internal */
  static _idGenerator: number = 0;
  /** @internal */
  static _nativePhysics: IPhysics;

  private _nativeCharacterControllerManager: ICharacterControllerManager;
  private _nativePhysicsManager: IPhysicsManager;
  private _physicalObjectsMap: Record<number, TriggerObject> = {};
  private _onContactEnter = (obj1: number, obj2: number) => {};
  private _onContactExit = (obj1: number, obj2: number) => {};
  private _onContactStay = (obj1: number, obj2: number) => {};
  private _onTriggerEnter = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = getEntity(shape1)._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerEnter(shape2);
    }

    scripts = getEntity(shape2)._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerEnter(shape1);
    }
  };

  private _onTriggerExit = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = getEntity(shape1)._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerExit(shape2);
    }

    scripts = getEntity(shape2)._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerExit(shape1);
    }
  };

  private _onTriggerStay = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = getEntity(shape1)._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerStay(shape2);
    }

    scripts = getEntity(shape2)._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerStay(shape1);
    }
  };

  /**
   * The character controller manager.
   */
  get characterControllerManager(): ICharacterControllerManager {
    return this._nativeCharacterControllerManager;
  }

  constructor() {
    this._nativePhysicsManager = PhysicsManager._nativePhysics.createPhysicsManager(
      this._onContactEnter,
      this._onContactExit,
      this._onContactStay,
      this._onTriggerEnter,
      this._onTriggerExit,
      this._onTriggerStay
    );
  }

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, outHitResult: HitResult): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, distance: number): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, distance: number, outHitResult: HitResult): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, distance: number, layerMask: Layer): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): boolean;

  raycast(
    ray: Ray,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    let hitResult: HitResult;

    let distance = Number.MAX_VALUE;
    if (typeof distanceOrResult === "number") {
      distance = distanceOrResult;
    } else if (distanceOrResult != undefined) {
      hitResult = distanceOrResult;
    }

    let layerMask = Layer.Everything;
    if (typeof layerMaskOrResult === "number") {
      layerMask = layerMaskOrResult;
    } else if (layerMaskOrResult != undefined) {
      hitResult = layerMaskOrResult;
    }

    if (outHitResult) {
      hitResult = outHitResult;
    }

    if (hitResult != undefined) {
      const result = this._nativePhysicsManager.raycast(ray, distance, (idx, distance, position, normal) => {
        hitResult.entity = getEntity(this._physicalObjectsMap[idx]);
        hitResult.distance = distance;
        normal.cloneTo(hitResult.normal);
        position.cloneTo(hitResult.point);
      });

      if (result) {
        if (hitResult.entity.layer & layerMask) {
          return true;
        } else {
          hitResult.entity = null;
          hitResult.distance = 0;
          hitResult.point.setValue(0, 0, 0);
          hitResult.normal.setValue(0, 0, 0);
          return false;
        }
      }
      return false;
    } else {
      return this._nativePhysicsManager.raycast(ray, distance);
    }
  }

  /**
   * Call on every frame to update pose of objects.
   * @internal
   */
  _update(deltaTime: number): void {
    this._nativePhysicsManager.update(deltaTime);
  }

  /**
   * Add ColliderShape into the manager.
   * @param colliderShape - The Collider Shape.
   * @internal
   */
  _addColliderShape(colliderShape: ColliderShape): void {
    this._physicalObjectsMap[colliderShape.id] = colliderShape;
    this._nativePhysicsManager.addColliderShape(colliderShape._nativeShape);
  }

  /**
   * Remove ColliderShape.
   * @param colliderShape - The Collider Shape.
   * @internal
   */
  _removeColliderShape(colliderShape: ColliderShape): void {
    delete this._physicalObjectsMap[colliderShape.id];
    this._nativePhysicsManager.removeColliderShape(colliderShape._nativeShape);
  }

  /**
   * Add collider into the manager.
   * @param collider - StaticCollider or DynamicCollider.
   * @internal
   */
  _addCollider(collider: Collider): void {
    this._nativePhysicsManager.addCollider(collider._nativeCollider);
  }

  /**
   * Remove collider.
   * @param collider - StaticCollider or DynamicCollider.
   * @internal
   */
  _removeCollider(collider: Collider): void {
    this._nativePhysicsManager.removeCollider(collider._nativeCollider);
  }

  /**
   * Add CharacterController into the manager.
   * @param characterController The Character Controller.
   * @internal
   */
  _addCharacterController(characterController: CharacterController) {
    this._physicalObjectsMap[characterController.id] = characterController;
    this._nativePhysicsManager.addCharacterController(characterController._nativeCharacterController);
  }

  /**
   * Remove CharacterController.
   * @param characterController The Character Controller.
   * @internal
   */
  _removeCharacterController(characterController: CharacterController) {
    delete this._physicalObjectsMap[characterController.id];
    this._nativePhysicsManager.removeCharacterController(characterController._nativeCharacterController);
  }

  /**
   * Create character controller manager.
   * @internal
   */
  _createCharacterControllerManager() {
    this._nativeCharacterControllerManager = this._nativePhysicsManager.createControllerManager();
  }
}
