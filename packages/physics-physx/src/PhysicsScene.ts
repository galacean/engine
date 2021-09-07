import { PhysXManager } from "./PhysXManager";
import { Collision } from "./Collision";
import { Collider } from "./Collider";
import { HitResult } from "./HitResult";
import { PhysicsScript } from "./PhysicsScript";
import { Ray, Vector3 } from "@oasis-engine/math";
import { Entity } from "@oasis-engine/core";

/** Filtering flags for scene queries. */
export enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

/** A scene is a collection of bodies and constraints which can interact. */
export class PhysicsScene {
  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _tempCollision: Collision = new Collision();
  private static _pxRaycastHit: any;
  private static _pxFilterData: any;

  /**
   * PhysX Trigger callback
   * @internal
   */
  triggerCallback = {
    onContactBegin: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap.get(obj1.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   PhysicsScene._tempCollision.collider = this._physicalObjectsMap
        //     .get(obj2.getQueryFilterData().word0)
        //     .getComponent(Collider);
        //   scripts[i].onCollisionEnter(PhysicsScene._tempCollision);
        // }
      }

      scripts = [];
      this._physicalObjectsMap.get(obj2.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   PhysicsScene._tempCollision.collider = this._physicalObjectsMap
        //     .get(obj2.getQueryFilterData().word0)
        //     .getComponent(Collider);
        //   scripts[i].onCollisionEnter(PhysicsScene._tempCollision);
        // }
      }
    },
    onContactEnd: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap.get(obj1.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   PhysicsScene._tempCollision.collider = this._physicalObjectsMap
        //     .get(obj2.getQueryFilterData().word0)
        //     .getComponent(Collider);
        //   scripts[i].onCollisionExit(PhysicsScene._tempCollision);
        // }
      }

      scripts = [];
      this._physicalObjectsMap.get(obj2.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   PhysicsScene._tempCollision.collider = this._physicalObjectsMap
        //     .get(obj2.getQueryFilterData().word0)
        //     .getComponent(Collider);
        //   scripts[i].onCollisionExit(PhysicsScene._tempCollision);
        // }
      }
    },
    onContactPersist: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap.get(obj1.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   PhysicsScene._tempCollision.collider = this._physicalObjectsMap
        //     .get(obj2.getQueryFilterData().word0)
        //     .getComponent(Collider);
        //   scripts[i].onCollisionStay(PhysicsScene._tempCollision);
        // }
      }

      scripts = [];
      this._physicalObjectsMap.get(obj2.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   PhysicsScene._tempCollision.collider = this._physicalObjectsMap
        //     .get(obj2.getQueryFilterData().word0)
        //     .getComponent(Collider);
        //   scripts[i].onCollisionStay(PhysicsScene._tempCollision);
        // }
      }
    },
    onTriggerBegin: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap.get(obj1.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   scripts[i].onTriggerEnters(
        //     this._physicalObjectsMap.get(obj2.getQueryFilterData().word0).getComponent(Collider)
        //   );
        // }
      }
    },
    onTriggerEnd: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap.get(obj1.getQueryFilterData().word0).getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        // for (let i = 0, len = scripts.length; i < len; i++) {
        //   scripts[i].onTriggerExits(
        //     this._physicalObjectsMap.get(obj2.getQueryFilterData().word0).getComponent(Collider)
        //   );
        // }
      }
    }
  };

  /**
   * PhysX Raycast callback
   * @internal
   */
  raycastCallback = {
    processTouches: (obj) => {
      const hit = new HitResult();
      hit.distance = obj.distance;
      hit.point.x = obj.position.x;
      hit.point.y = obj.position.y;
      hit.point.z = obj.position.z;
      hit.normal.x = obj.normal.x;
      hit.normal.y = obj.normal.y;
      hit.normal.z = obj.normal.z;
      this._hits.push(hit);
    }
  };

  /**
   * PhysX Scene object
   * @internal
   */
  _pxScene: any;

  private _hits: HitResult[] = [];
  private _gravity: Vector3 = new Vector3(0, -9.81, 0);

  /** Global gravity in the physical scene */
  get gravity(): Vector3 {
    return this._gravity;
  }

  set gravity(value: Vector3) {
    this._gravity = value;
    this._pxScene.setGravity({ x: value.x, y: value.y, z: value.z });
  }

  constructor() {
    const PHYSXSimulationCallbackInstance = PhysXManager.PhysX.PxSimulationEventCallback.implement(
      this.triggerCallback
    );
    const sceneDesc = PhysXManager.PhysX.getDefaultSceneDesc(
      PhysXManager.physics.getTolerancesScale(),
      0,
      PHYSXSimulationCallbackInstance
    );
    this._pxScene = PhysXManager.physics.createScene(sceneDesc);

    PhysicsScene._pxRaycastHit = new PhysXManager.PhysX.PxRaycastHit();
    PhysicsScene._pxFilterData = new PhysXManager.PhysX.PxQueryFilterData();
  }

  //--------------adding to the scene-------------------------------------------
  private _physicalObjectsMap = new Map<number, Entity>();

  /** add Static Actor, i.e Collider and Trigger. */
  addStaticActor(actor: Collider) {
    // this._physicalObjectsMap.set(actor.group_id, actor.entity);
    this._pxScene.addActor(actor._pxRigidStatic, null);
  }

  //--------------simulation ---------------------------------------------------
  /** call PhysX simulate */
  simulate(elapsedTime: number = 1 / 60, controlSimulation: boolean = true) {
    this._pxScene.simulate(elapsedTime, controlSimulation);
  }

  /** call PhysX fetchResults */
  fetchResults(block: boolean = true) {
    this._pxScene.fetchResults(block);
  }

  /** call PhysX advance */
  advance() {
    this._pxScene.advance();
  }

  /** call PhysX fetchCollision */
  fetchCollision(block: boolean = true) {
    this._pxScene.fetchCollision(block);
  }

  /** call PhysX collide */
  collide(elapsedTime: number = 1 / 60) {
    this._pxScene.collide(elapsedTime);
  }

  /**
   * call on every frame to update pose of objects
   */
  update() {
    this.simulate();
    this.fetchResults();
  }

  //----------------raycast-----------------------------------------------------
  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray): Boolean;

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
   * @param flag - Flag that is used to selectively ignore Colliders when casting
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, flag: QueryFlag): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param flag - Flag that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, flag: QueryFlag, outHitResult: HitResult): Boolean;

  raycast(
    ray: Ray,
    distance: number = Number.MAX_VALUE,
    flag: QueryFlag = QueryFlag.DYNAMIC | QueryFlag.STATIC,
    hit?: HitResult
  ): boolean {
    PhysicsScene._pxFilterData.flags = new PhysXManager.PhysX.PxQueryFlags(flag);
    const result = this._pxScene.raycastSingle(
      { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
      distance,
      PhysicsScene._pxRaycastHit,
      PhysicsScene._pxFilterData
    );

    if (result == false) {
      return false;
    }

    if (hit != undefined) {
      const hitResult = PhysicsScene._pxRaycastHit;
      const position = PhysicsScene._tempPosition;
      const normal = PhysicsScene._tempNormal;
      hit.entity = this._physicalObjectsMap.get(hitResult.getShape().getQueryFilterData().word0);
      hit.distance = hitResult.distance;
      {
        position.x = hitResult.position.x;
        position.y = hitResult.position.y;
        position.z = hitResult.position.z;
      }
      hit.point = position;
      {
        normal.x = hitResult.normal.x;
        normal.y = hitResult.normal.y;
        normal.z = hitResult.normal.z;
      }
      hit.normal = normal;
    }
    return result;
  }

  /**
   * Casts a ray through the Scene and returns the whole of hit.
   * @param ray The ray
   * @param hit If true is returned, outHitResult will contain more detailed collision information
   */
  raycastAll(ray: Ray, hit: HitResult[]): boolean;

  /**
   * Casts a ray through the Scene and returns the whole of hit.
   * @param ray The ray
   * @param hit If true is returned, outHitResult will contain more detailed collision information
   * @param distance The max distance the ray should check
   */
  raycastAll(ray: Ray, hit: HitResult[], distance: number): boolean;

  raycastAll(ray: Ray, hit: HitResult[], distance?: number): boolean {
    const PHYSXRaycastCallbackInstance = PhysXManager.PhysX.PxRaycastCallback.implement(this.raycastCallback);
    this._hits = [];
    const result = this._pxScene.raycast(
      { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
      distance ? distance : Number.MAX_VALUE,
      PHYSXRaycastCallbackInstance
    );

    if (result == false) {
      return false;
    }

    hit = this._hits;
    return result;
  }
}
