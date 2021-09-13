import { HitResult } from "./HitResult";
import { Ray } from "@oasis-engine/math";
import { IPhysics, IPhysicsManager } from "@oasis-engine/design";
import { Collider } from "./Collider";
import { Layer } from "../Layer";
import { ColliderShape } from "./shape/ColliderShape";
import { PhysicsState } from "./enums/PhysicsState";

/** Filtering flags for scene queries. */
export enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

export class PhysicsManager {
  /** @internal */
  static nativePhysics: IPhysics;
  private _nativePhysicsManager: IPhysicsManager;
  private _physicalObjectsMap = new Map<number, ColliderShape>();

  queryFlag: QueryFlag = QueryFlag.STATIC | QueryFlag.DYNAMIC;

  onContactBegin = (obj1: number, obj2: number) => {};

  onContactEnd = (obj1: number, obj2: number) => {};

  onContactPersist = (obj1: number, obj2: number) => {};

  onTriggerBegin = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap.get(obj1);
    const shape2 = this._physicalObjectsMap.get(obj2);
    shape1.setScriptState(PhysicsState.TOUCH_FOUND, shape2);
    shape2.setScriptState(PhysicsState.TOUCH_FOUND, shape1);
  };

  onTriggerEnd = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap.get(obj1);
    const shape2 = this._physicalObjectsMap.get(obj2);
    shape1.setScriptState(PhysicsState.TOUCH_LOST, shape2);
    shape2.setScriptState(PhysicsState.TOUCH_LOST, shape1);
  };

  constructor() {
    this._nativePhysicsManager = PhysicsManager.nativePhysics.createPhysicsManager(
      this.onContactBegin,
      this.onContactEnd,
      this.onContactPersist,
      this.onTriggerBegin,
      this.onTriggerEnd
    );
  }

  //--------------physics manager APIs------------------------------------------
  /** add Collider, i.e StaticCollider and DynamicCollider. */
  addCollider(actor: Collider) {
    const shapes = actor.shapes;
    for (let i = 0, len = shapes.length; i < len; i++) {
      this._physicalObjectsMap.set(shapes[i].id, shapes[i]);
    }
    this._nativePhysicsManager.addCollider(actor._nativeStaticCollider);
  }

  /** remove Collider, i.e StaticCollider and DynamicCollider. */
  removeCollider(actor: Collider) {
    const shapes = actor.shapes;
    for (let i = 0, len = shapes.length; i < len; i++) {
      this._physicalObjectsMap.delete(shapes[i].id);
    }
    this._nativePhysicsManager.removeCollider(actor._nativeStaticCollider);
  }

  /**
   * call on every frame to update pose of objects
   */
  update(deltaTime: number) {
    this._nativePhysicsManager.update(deltaTime);
  }

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, outHitResult: HitResult): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, outHitResult: HitResult): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): Boolean;

  raycast(
    ray: Ray,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): Boolean {
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
      const result = this._nativePhysicsManager.raycast(
        ray,
        distance,
        this.queryFlag,
        (idx, distance, position, normal) => {
          hitResult.entity = this._physicalObjectsMap.get(idx)._collider.entity;
          hitResult.distance = distance;
          normal.cloneTo(hitResult.normal);
          position.cloneTo(hitResult.point);
        }
      );

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
      return this._nativePhysicsManager.raycast(ray, distance, this.queryFlag);
    }
  }
}
