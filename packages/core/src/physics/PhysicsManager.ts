import { Entity } from "../Entity";
import { Script } from "../Script";
import { Ray, Vector3 } from "@oasis-engine/math";
import { Collision } from "./Collision";
import { Collider } from "./Collider";
import { IPhysicsManager } from "@oasis-engine/design";
import { Engine } from "../Engine";
import { HitResult } from "./HitResult";

export class PhysicsManager {
  private static _tempCollision: Collision = new Collision();
  private _physicalObjectsMap = new Map<number, Entity>();
  private _physicsManager: IPhysicsManager;

  onContactBegin = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsManager._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionEnter(PhysicsManager._tempCollision);
      }
    }

    scripts = [];
    this._physicalObjectsMap.get(obj2).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsManager._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionEnter(PhysicsManager._tempCollision);
      }
    }
  };

  onContactEnd = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsManager._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionExit(PhysicsManager._tempCollision);
      }
    }

    scripts = [];
    this._physicalObjectsMap.get(obj2).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsManager._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionExit(PhysicsManager._tempCollision);
      }
    }
  };

  onContactPersist = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsManager._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionStay(PhysicsManager._tempCollision);
      }
    }

    scripts = [];
    this._physicalObjectsMap.get(obj2).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsManager._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionStay(PhysicsManager._tempCollision);
      }
    }
  };

  onTriggerBegin = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        scripts[i].onTriggerEnters(this._physicalObjectsMap.get(obj2).getComponent(Collider));
      }
    }
  };

  onTriggerEnd = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        scripts[i].onTriggerExits(this._physicalObjectsMap.get(obj2).getComponent(Collider));
      }
    }
  };

  constructor(engine: Engine) {
    this._physicsManager = engine._physicsEngine.createPhysicsManager(
      this.onContactBegin,
      this.onContactEnd,
      this.onContactPersist,
      this.onTriggerBegin,
      this.onTriggerEnd
    );
  }

  /** Global gravity in the physical scene */
  get gravity(): Vector3 {
    return this._physicsManager.gravity;
  }

  set gravity(value: Vector3) {
    this._physicsManager.gravity = value;
  }

  getPhysicsEntity(idx: number): Entity {
    return this._physicalObjectsMap.get(idx);
  }

  //--------------adding to the scene-------------------------------------------
  /** add Static Actor, i.e Collider and Trigger. */
  addStaticActor(actor: Collider) {
    this._physicalObjectsMap.set(actor.getGroup_id(), actor.entity);
    this._physicsManager.addStaticActor(actor._collider);
  }

  //--------------simulation ---------------------------------------------------
  simulate(elapsedTime: number = 1 / 60, controlSimulation: boolean = true) {
    this._physicsManager.simulate(elapsedTime, controlSimulation);
  }

  fetchResults(block: boolean = true) {
    this._physicsManager.fetchResults(block);
  }

  advance() {
    this._physicsManager.advance();
  }

  fetchCollision(block: boolean = true) {
    this._physicsManager.fetchCollision(block);
  }

  collide(elapsedTime: number = 1 / 60) {
    this._physicsManager.collide(elapsedTime);
  }

  /**
   * call on every frame to update pose of objects
   */
  update() {
    this._physicsManager.update();
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
  raycast(ray: Ray, distance: number, flag: number): Boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param flag - Flag that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the ray intersects with a Collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, flag: number, outHitResult: HitResult): Boolean;

  raycast(ray: Ray, distance: number = Number.MAX_VALUE, flag?: number, hit?: HitResult): Boolean {
    if (hit != undefined) {
      return this._physicsManager.raycast(ray, distance, flag, (idx, distance, position, normal) => {
        hit.entity = this.getPhysicsEntity(idx);
        hit.distance = distance;
        hit.point = position;
        hit.normal = normal;
      });
    } else {
      return this._physicsManager.raycast(ray, distance, flag);
    }
  }
}
