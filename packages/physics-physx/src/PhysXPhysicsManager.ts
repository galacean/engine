import { PhysXPhysics } from "./PhysXPhysics";
import { Ray, Vector3 } from "@oasis-engine/math";
import { IPhysicsManager } from "@oasis-engine/design";
import { Collider } from "./Collider";

/** Filtering flags for scene queries. */
export enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

/**
 * Physics state
 */
export enum PhysicsState {
  TOUCH_FOUND,
  TOUCH_PERSISTS,
  TOUCH_LOST,
  TOUCH_NONE
}

/**
 * A manager is a collection of bodies and constraints which can interact.
 */
export class PhysXPhysicsManager implements IPhysicsManager {
  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _pxRaycastHit: any;
  private static _pxFilterData: any;

  private _pxScene: any;

  private readonly _onContactBegin?: Function;
  private readonly _onContactEnd?: Function;
  private readonly _onContactPersist?: Function;
  private readonly _onTriggerBegin?: Function;
  private readonly _onTriggerEnd?: Function;
  private readonly _onTriggerPersist?: Function;

  private _eventMap: Map<number, [number, PhysicsState]> = new Map();

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);

  /** Global gravity in the physical scene */
  get gravity(): Vector3 {
    return this._gravity;
  }

  set gravity(value: Vector3) {
    this._gravity = value;
    this._pxScene.setGravity({ x: value.x, y: value.y, z: value.z });
  }

  constructor(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ) {
    this._onContactBegin = onContactBegin;
    this._onContactEnd = onContactEnd;
    this._onContactPersist = onContactPersist;
    this._onTriggerBegin = onTriggerBegin;
    this._onTriggerEnd = onTriggerEnd;
    this._onTriggerPersist = onTriggerPersist;

    const triggerCallback = {
      onContactBegin: (obj1, obj2) => {},
      onContactEnd: (obj1, obj2) => {},
      onContactPersist: (obj1, obj2) => {},
      onTriggerBegin: (obj1, obj2) => {
        this._eventMap.set(obj1.getQueryFilterData().word0, [
          obj2.getQueryFilterData().word0,
          PhysicsState.TOUCH_FOUND
        ]);
        this._eventMap.set(obj2.getQueryFilterData().word0, [
          obj1.getQueryFilterData().word0,
          PhysicsState.TOUCH_FOUND
        ]);
      },
      onTriggerEnd: (obj1, obj2) => {
        this._eventMap.set(obj1.getQueryFilterData().word0, [obj2.getQueryFilterData().word0, PhysicsState.TOUCH_LOST]);
        this._eventMap.set(obj2.getQueryFilterData().word0, [obj1.getQueryFilterData().word0, PhysicsState.TOUCH_LOST]);
      }
    };

    const PHYSXSimulationCallbackInstance = PhysXPhysics.PhysX.PxSimulationEventCallback.implement(triggerCallback);
    const sceneDesc = PhysXPhysics.PhysX.getDefaultSceneDesc(
      PhysXPhysics.physics.getTolerancesScale(),
      0,
      PHYSXSimulationCallbackInstance
    );
    this._pxScene = PhysXPhysics.physics.createScene(sceneDesc);

    PhysXPhysicsManager._pxRaycastHit = new PhysXPhysics.PhysX.PxRaycastHit();
    PhysXPhysicsManager._pxFilterData = new PhysXPhysics.PhysX.PxQueryFilterData();
  }

  //--------------public APIs--------------------------------------------------
  /**
   * add Collider into the manager
   * @param collider StaticCollider or DynamicCollider.
   */
  addCollider(collider: Collider) {
    this._pxScene.addActor(collider._pxActor, null);
    for (let i = 0, len = collider._shapes.length; i < len; i++) {
      const shape = collider._shapes[i];
      this._eventMap.set(shape._id, [null, PhysicsState.TOUCH_NONE]);
    }
  }

  /**
   * remove Collider
   * @param collider StaticCollider or DynamicCollider.
   */
  removeCollider(collider: Collider) {
    this._pxScene.removeActor(collider._pxActor, true);
    for (let i = 0, len = collider._shapes.length; i < len; i++) {
      const shape = collider._shapes[i];
      this._eventMap.delete(shape._id);
    }
  }

  /**
   * call on every frame to update pose of objects
   */
  update(elapsedTime: number) {
    this._simulate(elapsedTime);
    this._fetchResults();
    this._resolveEvent();
  }

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param queryFlag - Flag that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, queryFlag: QueryFlag): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param queryFlag - Flag that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, queryFlag: QueryFlag, outHitResult: Function): Boolean;

  raycast(
    ray: Ray,
    distance: number,
    queryFlag: QueryFlag,
    hit?: (id: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    PhysXPhysicsManager._pxFilterData.flags = new PhysXPhysics.PhysX.PxQueryFlags(queryFlag);
    const result = this._pxScene.raycastSingle(
      { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
      distance,
      PhysXPhysicsManager._pxRaycastHit,
      PhysXPhysicsManager._pxFilterData
    );

    if (result == false) {
      return false;
    }

    if (hit != undefined) {
      const hitResult = PhysXPhysicsManager._pxRaycastHit;
      const position = PhysXPhysicsManager._tempPosition;
      {
        position.x = hitResult.position.x;
        position.y = hitResult.position.y;
        position.z = hitResult.position.z;
      }
      const normal = PhysXPhysicsManager._tempNormal;
      {
        normal.x = hitResult.normal.x;
        normal.y = hitResult.normal.y;
        normal.z = hitResult.normal.z;
      }

      hit(hitResult.getShape().getQueryFilterData().word0, hitResult.distance, position, normal);
    }
    return result;
  }

  //--------------private APIs -------------------------------------------------
  /** call PhysX simulate */
  private _simulate(elapsedTime: number = 1 / 60, controlSimulation: boolean = true) {
    this._pxScene.simulate(elapsedTime, controlSimulation);
  }

  /** call PhysX fetchResults */
  private _fetchResults(block: boolean = true) {
    this._pxScene.fetchResults(block);
  }

  /** call PhysX advance */
  private _advance() {
    this._pxScene.advance();
  }

  /** call PhysX fetchCollision */
  private _fetchCollision(block: boolean = true) {
    this._pxScene.fetchCollision(block);
  }

  /** call PhysX collide */
  private _collide(elapsedTime: number = 1 / 60) {
    this._pxScene.collide(elapsedTime);
  }

  private _resolveEvent() {
    this._eventMap.forEach((value, key) => {
      if (value[1] == PhysicsState.TOUCH_FOUND) {
        this._onTriggerBegin(key, value[0]);
        this._eventMap.set(key, [value[0], PhysicsState.TOUCH_PERSISTS]);
      } else if (value[1] == PhysicsState.TOUCH_PERSISTS) {
        this._onTriggerPersist(key, value[0]);
      } else if (value[1] == PhysicsState.TOUCH_LOST) {
        this._onTriggerEnd(key, value[0]);
        this._eventMap.set(key, [null, PhysicsState.TOUCH_NONE]);
      }
    });
  }
}
