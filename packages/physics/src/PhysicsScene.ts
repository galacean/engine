import { PhysXManager } from "./PhysXManager";
import { Script } from "@oasis-engine/core";
import { Collision } from "./Collision";
import { Collider } from "./Collider";
import { RaycastHit } from "./RaycastHit";
import { Vector3 } from "@oasis-engine/math";
import { Rigidbody } from "./Rigidbody";

/** Filtering flags for scene queries. */
export enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

export class PhysicsScene {
  triggerCallback = {
    onContactBegin: (obj1, obj2) => {
      let scripts: Script[] = [];
      this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          let collision = new Collision(this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
      }

      scripts = [];
      this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          let collision = new Collision(this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponent(Collider));
        });
      }
    },
    onContactEnd: (obj1, obj2) => {
      let scripts: Script[] = [];
      this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          let collision = new Collision(this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
      }

      scripts = [];
      this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          let collision = new Collision(this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponent(Collider));
        });
      }
    },
    onContactPersist: (obj1, obj2) => {
      let scripts: Script[] = [];
      this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          let collision = new Collision(this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
      }

      scripts = [];
      this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          let collision = new Collision(this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponent(Collider));
        });
      }
    },
    onTriggerBegin: (obj1, obj2) => {
      let scripts: Script[] = [];
      this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          value.onTriggerEnter(this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
      }
    },
    onTriggerEnd: (obj1, obj2) => {
      let scripts: Script[] = [];
      this._physicObjectsMap[obj1.getQueryFilterData().word0].getComponents(Script, scripts);
      if (scripts.length > 0) {
        scripts.forEach((value) => {
          value.onTriggerExit(this._physicObjectsMap[obj2.getQueryFilterData().word0].getComponent(Collider));
        });
      }
    }
  };

  raycastCallback = {
    processTouches: (obj) => {
      const hit = new RaycastHit();
      hit.distance = obj.distance;
      hit.point.x = obj.position.x;
      hit.point.y = obj.position.y;
      hit.point.z = obj.position.z;
      hit.normal.x = obj.normal.x;
      hit.normal.y = obj.normal.y;
      hit.normal.z = obj.normal.z;
      hit.collider = this._physicObjectsMap[obj.getShape().getQueryFilterData().word0].getComponent(Collider);
      this._hits.push(hit);
    }
  };

  get physicObjectsMap(): any {
    return this._physicObjectsMap;
  }

  //------------------------------------------------------------------------------------------------------------------
  raycastTest(origin: Vector3, direction: Vector3, maxDistance: number): boolean {
    return this._PxScene.raycastAny(
      { x: origin.x, y: origin.y, z: origin.z },
      {
        x: direction.x,
        y: direction.y,
        z: direction.z
      },
      maxDistance
    );
  }

  raycast(
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
    hit: RaycastHit,
    flag: QueryFlag = QueryFlag.DYNAMIC | QueryFlag.STATIC
  ): boolean {
    const pxRaycastHit: any = new PhysXManager.PhysX.PxRaycastHit();
    const filterData: any = new PhysXManager.PhysX.PxQueryFilterData();
    filterData.flags = new PhysXManager.PhysX.PxQueryFlags(flag);
    const result = this._PxScene.raycastSingle(
      { x: origin.x, y: origin.y, z: origin.z },
      {
        x: direction.x,
        y: direction.y,
        z: direction.z
      },
      maxDistance,
      pxRaycastHit,
      filterData
    );

    if (result == false) {
      return;
    }

    hit.distance = pxRaycastHit.distance;
    hit.point = new Vector3(pxRaycastHit.position.x, pxRaycastHit.position.y, pxRaycastHit.position.z);
    hit.normal = new Vector3(pxRaycastHit.normal.x, pxRaycastHit.normal.y, pxRaycastHit.normal.z);
    hit.entity = this._physicObjectsMap[pxRaycastHit.getShape().getQueryFilterData().word0];

    return result;
  }

  raycastAll(origin: Vector3, direction: Vector3, maxDistance: number): boolean {
    const PHYSXRaycastCallbackInstance = PhysXManager.PhysX.PxRaycastCallback.implement(this.raycastCallback);
    this._hits = [];
    return this._PxScene.raycast(
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

  get hits(): RaycastHit[] {
    return this._hits;
  }

  //------------------------------------------------------------------------------------------------------------------
  get gravity(): Vector3 {
    return this._gravity;
  }

  set gravity(value: Vector3) {
    this._gravity = value;
    this._PxScene.setGravity({ x: value.x, y: value.y, z: value.z });
  }

  //------------------------------------------------------------------------------------------------------------------
  private _physicObjectsMap: any = {};
  private _hits: RaycastHit[] = [];

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);

  private _PxScene: any;

  addDynamicActor(actor: Rigidbody) {
    this._physicObjectsMap[actor.collider.group_id] = actor.entity;
    this._PxScene.addActor(actor.get(), null);
  }

  addStaticActor(actor: Collider) {
    this._physicObjectsMap[actor.group_id] = actor.entity;
    this._PxScene.addActor(actor._PxRigidStatic, null);
  }

  //------------------------------------------------------------------------------------------------------------------
  simulate(elapsedTime: number = 1 / 60, controlSimulation: boolean = true) {
    this._PxScene.simulate(elapsedTime, controlSimulation);
  }

  fetchResults(block: boolean = true) {
    this._PxScene.fetchResults(block);
  }

  advance() {
    this._PxScene.advance();
  }

  fetchCollision(block: boolean = true) {
    this._PxScene.fetchCollision(block);
  }

  collide(elapsedTime: number = 1 / 60) {
    this._PxScene.collide(elapsedTime);
  }

  init() {
    const PHYSXSimulationCallbackInstance = PhysXManager.PhysX.PxSimulationEventCallback.implement(
      this.triggerCallback
    );
    const sceneDesc = PhysXManager.PhysX.getDefaultSceneDesc(
      PhysXManager.physics.getTolerancesScale(),
      0,
      PHYSXSimulationCallbackInstance
    );
    this._PxScene = PhysXManager.physics.createScene(sceneDesc);
  }

  get(): any {
    return this._PxScene;
  }
}
