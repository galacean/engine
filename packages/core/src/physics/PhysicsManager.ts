import { HitResult } from "./HitResult";
import { Ray } from "@oasis-engine/math";
import { IPhysics, IPhysicsManager } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Layer } from "../Layer";
import { ColliderShape } from "./shape/ColliderShape";

/**
 * A physics manager is a collection of bodies and constraints which can interact.
 */
export class PhysicsManager {
  /** @internal */
  static _nativePhysics: IPhysics;

  private _nativePhysicsManager: IPhysicsManager;
  private _physicalObjectsMap: Record<number, ColliderShape> = {};
  private _onContactEnter = (obj1: number, obj2: number) => {
  };
  private _onContactExit = (obj1: number, obj2: number) => {
  };
  private _onContactStay = (obj1: number, obj2: number) => {
  };
  private _onTriggerEnter = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerEnter(shape2);
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerEnter(shape1);
    }
  };

  private _onTriggerExit = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerExit(shape2);
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerExit(shape1);
    }
  };

  private _onTriggerStay = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerStay(shape2);
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      scripts.get(i).onTriggerStay(shape1);
    }
  };

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
   * Add collider into the manager.
   * @param collider - StaticCollider or DynamicCollider.
   */
  addCollider(collider: Collider): void {
    const shapes = collider.shapes;
    for (let i = 0, len = shapes.length; i < len; i++) {
      this._physicalObjectsMap[shapes[i].id] = shapes[i];
    }
    this._nativePhysicsManager.addCollider(collider._nativeCollider);
  }

  /**
   * Remove collider.
   * @param collider - StaticCollider or DynamicCollider.
   */
  removeCollider(collider: Collider): void {
    const shapes = collider.shapes;
    for (let i = 0, len = shapes.length; i < len; i++) {
      delete this._physicalObjectsMap[shapes[i].id];
    }
    this._nativePhysicsManager.removeCollider(collider._nativeCollider);
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
        hitResult.entity = this._physicalObjectsMap[idx]._collider.entity;
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
}
