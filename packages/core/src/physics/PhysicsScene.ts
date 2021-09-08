import { Entity } from "../Entity";
import { Script } from "../Script";
import { Ray, Vector3 } from "@oasis-engine/math";
import { Collision } from "./Collision";
import { Collider } from "./Collider";
import { IPhysicsScene } from "@oasis-engine/design";
import { Engine } from "../Engine";
import { HitResult } from "./HitResult";

export class PhysicsScene {
  private static _tempCollision: Collision = new Collision();
  private static _tempHitResult: HitResult = new HitResult();
  private _physicalObjectsMap = new Map<number, Entity>();
  private _physicsScene: IPhysicsScene;

  onContactBegin = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsScene._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionEnter(PhysicsScene._tempCollision);
      }
    }

    scripts = [];
    this._physicalObjectsMap.get(obj2).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsScene._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionEnter(PhysicsScene._tempCollision);
      }
    }
  };

  onContactEnd = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsScene._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionExit(PhysicsScene._tempCollision);
      }
    }

    scripts = [];
    this._physicalObjectsMap.get(obj2).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsScene._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionExit(PhysicsScene._tempCollision);
      }
    }
  };

  onContactPersist = (obj1: number, obj2: number) => {
    let scripts: Script[] = [];
    this._physicalObjectsMap.get(obj1).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsScene._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionStay(PhysicsScene._tempCollision);
      }
    }

    scripts = [];
    this._physicalObjectsMap.get(obj2).getComponents(Script, scripts);
    if (scripts.length > 0) {
      for (let i = 0, len = scripts.length; i < len; i++) {
        PhysicsScene._tempCollision.collider = this._physicalObjectsMap.get(obj2).getComponent(Collider);
        scripts[i].onCollisionStay(PhysicsScene._tempCollision);
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
    this._physicsScene = engine._physicsEngine.createPhysicsScene(
      this.onContactBegin,
      this.onContactEnd,
      this.onContactPersist,
      this.onTriggerBegin,
      this.onTriggerEnd
    );
  }

  /** Global gravity in the physical scene */
  get gravity(): Vector3 {
    return this._physicsScene.gravity;
  }

  set gravity(value: Vector3) {
    this._physicsScene.gravity = value;
  }

  getPhysicsEntity(idx: number): Entity {
    return this._physicalObjectsMap.get(idx);
  }

  //--------------adding to the scene-------------------------------------------
  /** add Static Actor, i.e Collider and Trigger. */
  addStaticActor(actor: Collider) {
    this._physicalObjectsMap.set(actor.getGroup_id(), actor.entity);
    this._physicsScene.addStaticActor(actor._collider);
  }

  //--------------simulation ---------------------------------------------------
  simulate(elapsedTime: number = 1 / 60, controlSimulation: boolean = true) {
    this._physicsScene.simulate(elapsedTime, controlSimulation);
  }

  fetchResults(block: boolean = true) {
    this._physicsScene.fetchResults(block);
  }

  advance() {
    this._physicsScene.advance();
  }

  fetchCollision(block: boolean = true) {
    this._physicsScene.fetchCollision(block);
  }

  collide(elapsedTime: number = 1 / 60) {
    this._physicsScene.collide(elapsedTime);
  }

  /**
   * call on every frame to update pose of objects
   */
  update() {
    this._physicsScene.update();
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
      hit = PhysicsScene._tempHitResult;
      return this._physicsScene.raycast(ray, distance, flag, (idx, distance, position, normal) => {
        hit.entity = this.getPhysicsEntity(idx);
        hit.distance = distance;
        hit.point = position;
        hit.normal = normal;
      });
    } else {
      return this._physicsScene.raycast(ray, distance, flag);
    }
  }
}
