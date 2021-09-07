import { Entity } from "../Entity";
import { Script } from "../Script";
import { Vector3 } from "@oasis-engine/math";
import { Collision } from "./Collision";
import { Collider } from "./Collider";
import { IPhysicsScene } from "@oasis-engine/design";
import { Engine } from "../Engine";

export class PhysicsScene {
  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _tempCollision: Collision = new Collision();

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
}
