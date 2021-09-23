import { PhysXPhysics } from "./PhysXPhysics";
import { Ray, Vector3 } from "@oasis-engine/math";
import { IPhysicsManager } from "@oasis-engine/design";
import { PhysXCollider } from "./PhysXCollider";
import { DisorderedArray } from "./DisorderedArray";

/**
 * A manager is a collection of bodies and constraints which can interact.
 */
export class PhysXPhysicsManager implements IPhysicsManager {
  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _pxRaycastHit: any;
  private static _pxFilterData: any;
  private static _tempGravity = {
    x: 0,
    y: -9.81,
    z: 0
  };
  private static _tempOrigin = {
    x: 0,
    y: 0,
    z: 0
  };
  private static _tempDirection = {
    x: 0,
    y: 0,
    z: 0
  };

  private _queryFlag: QueryFlag = QueryFlag.STATIC | QueryFlag.DYNAMIC;
  private _pxScene: any;

  private readonly _onContactBegin?: Function;
  private readonly _onContactEnd?: Function;
  private readonly _onContactPersist?: Function;
  private readonly _onTriggerBegin?: Function;
  private readonly _onTriggerEnd?: Function;
  private readonly _onTriggerPersist?: Function;

  private _currentEvents: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();
  private _eventMap: Record<number, Record<number, TriggerEvent>> = {};
  private _eventPool: TriggerEvent[] = [];

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);

  /**
   * {@inheritDoc IPhysicsManager.setGravity }
   */
  setGravity(value: Vector3) {
    if (this._gravity !== value) {
      value.cloneTo(this._gravity);
    }
    PhysXPhysicsManager._tempGravity.x = value.x;
    PhysXPhysicsManager._tempGravity.y = value.y;
    PhysXPhysicsManager._tempGravity.z = value.z;
    this._pxScene.setGravity(PhysXPhysicsManager._tempGravity);
  }

  constructor(
    onContactBegin?: (obj1: number, obj2: number) => void,
    onContactEnd?: (obj1: number, obj2: number) => void,
    onContactPersist?: (obj1: number, obj2: number) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerPersist?: (obj1: number, obj2: number) => void
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
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
        event.state = PhysicsState.TOUCH_FOUND;
        this._currentEvents.add(event);
      },
      onTriggerEnd: (obj1, obj2) => {
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        const event = index1 < index2 ? this._eventMap[index1][index2] : this._eventMap[index2][index1];
        event.state = PhysicsState.TOUCH_LOST;
        this._eventMap[index1][index2] = undefined;
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

  /**
   * {@inheritDoc IPhysicsManager.addCollider }
   */
  addCollider(collider: PhysXCollider): void {
    this._pxScene.addActor(collider._pxActor, null);
    for (let i = 0, len = collider._shapes.length; i < len; i++) {
      this._eventMap[collider._shapes[i]._id] = {};
    }
  }

  /**
   * {@inheritDoc IPhysicsManager.removeCollider }
   */
  removeCollider(collider: PhysXCollider): void {
    this._pxScene.removeActor(collider._pxActor, true);
    for (let i = 0, len = collider._shapes.length; i < len; i++) {
      delete this._eventMap[collider._shapes[i]._id];
    }
  }

  /**
   * {@inheritDoc IPhysicsManager.update }
   */
  update(elapsedTime: number): void {
    this._simulate(elapsedTime);
    this._fetchResults();
    this._resolveEvent();
  }

  /**
   * {@inheritDoc IPhysicsManager.raycast }
   */
  raycast(
    ray: Ray,
    distance: number,
    hit?: (id: number, distance: number, position: Vector3, normal: Vector3) => void
  ): Boolean {
    PhysXPhysicsManager._pxFilterData.flags = new PhysXPhysics.PhysX.PxQueryFlags(this._queryFlag);

    const { origin, direction } = ray;
    PhysXPhysicsManager._tempOrigin.x = origin.x;
    PhysXPhysicsManager._tempOrigin.y = origin.y;
    PhysXPhysicsManager._tempOrigin.z = origin.z;
    PhysXPhysicsManager._tempDirection.x = direction.x;
    PhysXPhysicsManager._tempDirection.y = direction.y;
    PhysXPhysicsManager._tempDirection.z = direction.z;

    const result = this._pxScene.raycastSingle(
      PhysXPhysicsManager._tempOrigin,
      PhysXPhysicsManager._tempDirection,
      distance,
      PhysXPhysicsManager._pxRaycastHit,
      PhysXPhysicsManager._pxFilterData
    );

    if (result == false) {
      return false;
    }

    if (hit != undefined) {
      const hitResult = PhysXPhysicsManager._pxRaycastHit;
      const { position: pos, normal: nor } = hitResult;

      const position = PhysXPhysicsManager._tempPosition;
      position.setValue(pos.x, pos.y, pos.z);

      const normal = PhysXPhysicsManager._tempNormal;
      normal.setValue(nor.x, nor.y, nor.z);

      hit(hitResult.getShape().getQueryFilterData().word0, hitResult.distance, position, normal);
    }
    return result;
  }

  private _simulate(elapsedTime: number = 1 / 60, controlSimulation: boolean = true): void {
    this._pxScene.simulate(elapsedTime, controlSimulation);
  }

  private _fetchResults(block: boolean = true): void {
    this._pxScene.fetchResults(block);
  }

  private _advance(): void {
    this._pxScene.advance();
  }

  private _fetchCollision(block: boolean = true): void {
    this._pxScene.fetchCollision(block);
  }

  private _collide(elapsedTime: number = 1 / 60): void {
    this._pxScene.collide(elapsedTime);
  }

  private _getTrigger(index1: number, index2: number): TriggerEvent {
    const eventMap = this._eventMap;
    if (eventMap[index1][index2] == undefined) {
      const event = this._eventPool.length ? new TriggerEvent(index1, index2) : this._eventPool.pop();
      eventMap[index1][index2] = event;
      return event;
    } else {
      throw "location have already been set!";
    }
  }

  private _resolveEvent(): void {
    for (let i = 0, n = this._currentEvents.length; i < n; ) {
      const event = this._currentEvents.get(i);
      if (event.state == PhysicsState.TOUCH_FOUND) {
        this._onTriggerBegin(event.index1, event.index2);
        event.state = PhysicsState.TOUCH_PERSISTS;
        i++;
      } else if (event.state == PhysicsState.TOUCH_PERSISTS) {
        this._onTriggerPersist(event.index1, event.index2);
        i++;
      } else if (event.state == PhysicsState.TOUCH_LOST) {
        this._onTriggerEnd(event.index1, event.index2);
        this._currentEvents.deleteByIndex(i);
        this._eventPool.push(event);
        n--;
      }
    }
  }
}

/**
 * Filtering flags for scene queries.
 */
enum QueryFlag {
  STATIC = 1 << 0,
  DYNAMIC = 1 << 1,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

/**
 * Physics state
 */
enum PhysicsState {
  TOUCH_FOUND,
  TOUCH_PERSISTS,
  TOUCH_LOST,
  TOUCH_NONE
}

class TriggerEvent {
  state: PhysicsState;
  index1: number;
  index2: number;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}
