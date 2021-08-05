import { PhysXManager } from "./PhysXManager";
import { Collision } from "./Collision";
import { Collider } from "./Collider";
import { HitResult } from "./HitResult";
import { Ray, Vector3 } from "@oasis-engine/math";
import { Rigidbody } from "./Rigidbody";
import { PhysicsScript } from "./PhysicsScript";
import { Layer } from "@oasis-engine/core/src";

/** Filtering flags for scene queries. */
export enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

/** A scene is a collection of bodies and constraints which can interact. */
export class PhysicsScene {
  /**
   * PhysX Trigger callback
   * @internal
   */
  triggerCallback = {
    onContactBegin: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          let collision = new Collision(
            this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider)
          );
          value.onCollisionEnter(collision);
        });
      }

      scripts = [];
      this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          let collision = new Collision(
            this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponent(Collider)
          );
          value.onCollisionEnter(collision);
        });
      }
    },
    onContactEnd: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          let collision = new Collision(
            this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider)
          );
          value.onCollisionExit(collision);
        });
      }

      scripts = [];
      this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          let collision = new Collision(
            this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponent(Collider)
          );
          value.onCollisionExit(collision);
        });
      }
    },
    onContactPersist: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          let collision = new Collision(
            this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider)
          );
          value.onCollisionStay(collision);
        });
      }

      scripts = [];
      this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          let collision = new Collision(
            this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponent(Collider)
          );
          value.onCollisionStay(collision);
        });
      }
    },
    onTriggerBegin: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          value.onTriggerEnter(this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
      }
    },
    onTriggerEnd: (obj1, obj2) => {
      let scripts: PhysicsScript[] = [];
      this._physicalObjectsMap[obj1.getQueryFilterData().word0].getComponents(PhysicsScript, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value: PhysicsScript) => {
          value.onTriggerExit(this._physicalObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
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
  }

  //--------------adding to the scene-------------------------------------------
  private _physicalObjectsMap: any = {};

  /** get the map of physical objects and PhysX objects. */
  get physicalObjectsMap(): any {
    return this._physicalObjectsMap;
  }

  /** add Dynamic Actor, i.e. Rigidbody. */
  addDynamicActor(actor: Rigidbody) {
    this._physicalObjectsMap[actor.collider.group_id] = actor.entity;
    this._pxScene.addActor(actor._pxRigidActor, null);
  }

  /** add Static Actor, i.e Collider and Trigger. */
  addStaticActor(actor: Collider) {
    this._physicalObjectsMap[actor.group_id] = actor.entity;
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
    distance?: number,
    flag: QueryFlag = QueryFlag.DYNAMIC | QueryFlag.STATIC,
    hit?: HitResult
  ): boolean {
    const pxRaycastHit: any = new PhysXManager.PhysX.PxRaycastHit();
    const filterData: any = new PhysXManager.PhysX.PxQueryFilterData();
    filterData.flags = new PhysXManager.PhysX.PxQueryFlags(flag);
    const result = this._pxScene.raycastSingle(
      { x: ray.origin.x, y: ray.origin.y, z: ray.origin.z },
      { x: ray.direction.x, y: ray.direction.y, z: ray.direction.z },
      distance,
      pxRaycastHit,
      filterData
    );

    if (result == false) {
      return;
    }

    hit.distance = pxRaycastHit.distance;
    hit.point = new Vector3(pxRaycastHit.position.x, pxRaycastHit.position.y, pxRaycastHit.position.z);
    hit.normal = new Vector3(pxRaycastHit.normal.x, pxRaycastHit.normal.y, pxRaycastHit.normal.z);
    hit.entity = this._physicalObjectsMap[pxRaycastHit.getShape().getQueryFilterData().word0];

    return result;
  }

  private _hits: HitResult[] = [];

  get hits(): HitResult[] {
    return this._hits;
  }

  raycastTest(origin: Vector3, direction: Vector3, maxDistance: number): boolean {
    return this._pxScene.raycastAny(
      { x: origin.x, y: origin.y, z: origin.z },
      {
        x: direction.x,
        y: direction.y,
        z: direction.z
      },
      maxDistance
    );
  }

  raycastAll(origin: Vector3, direction: Vector3, maxDistance: number): boolean {
    const PHYSXRaycastCallbackInstance = PhysXManager.PhysX.PxRaycastCallback.implement(this.raycastCallback);
    this._hits = [];
    return this._pxScene.raycast(
      { x: origin.x, y: origin.y, z: origin.z },
      {
        x: direction.x,
        y: direction.y,
        z: direction.z
      },
      maxDistance,
      PHYSXRaycastCallbackInstance
    );
  }
}
