import { IPhysicsManager } from "@oasis-engine/design";
import { Ray, Vector3 } from "oasis-engine";
import { DisorderedArray } from "./DisorderedArray";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXCollider } from "./PhysXCollider";
import { PhysXPhysics } from "./PhysXPhysics";
import { PhysXColliderShape } from "./shape/PhysXColliderShape";

/**
 * A manager is a collection of colliders and constraints which can interact.
 */
export class PhysXPhysicsManager implements IPhysicsManager {
  /** @internal */
  _pxControllerManager: any = null;

  private static _tempPosition: Vector3 = new Vector3();
  private static _tempNormal: Vector3 = new Vector3();
  private static _pxRaycastHit: any;
  private static _pxFilterData: any;

  static _init() {
    PhysXPhysicsManager._pxRaycastHit = new PhysXPhysics._physX.PxRaycastHit();
    PhysXPhysicsManager._pxFilterData = new PhysXPhysics._physX.PxQueryFilterData();
    PhysXPhysicsManager._pxFilterData.flags = new PhysXPhysics._physX.PxQueryFlags(
      QueryFlag.STATIC | QueryFlag.DYNAMIC | QueryFlag.PRE_FILTER
    );
  }

  private _pxScene: any;

  private readonly _onContactEnter?: (obj1: number, obj2: number) => void;
  private readonly _onContactExit?: (obj1: number, obj2: number) => void;
  private readonly _onContactStay?: (obj1: number, obj2: number) => void;
  private readonly _onTriggerEnter?: (obj1: number, obj2: number) => void;
  private readonly _onTriggerExit?: (obj1: number, obj2: number) => void;
  private readonly _onTriggerStay?: (obj1: number, obj2: number) => void;

  private _currentEvents: DisorderedArray<TriggerEvent> = new DisorderedArray<TriggerEvent>();
  private _eventMap: Record<number, Record<number, TriggerEvent>> = {};
  private _eventPool: TriggerEvent[] = [];

  constructor(
    onContactEnter?: (obj1: number, obj2: number) => void,
    onContactExit?: (obj1: number, obj2: number) => void,
    onContactStay?: (obj1: number, obj2: number) => void,
    onTriggerEnter?: (obj1: number, obj2: number) => void,
    onTriggerExit?: (obj1: number, obj2: number) => void,
    onTriggerStay?: (obj1: number, obj2: number) => void
  ) {
    this._onContactEnter = onContactEnter;
    this._onContactExit = onContactExit;
    this._onContactStay = onContactStay;
    this._onTriggerEnter = onTriggerEnter;
    this._onTriggerExit = onTriggerExit;
    this._onTriggerStay = onTriggerStay;

    const triggerCallback = {
      onContactBegin: (obj1, obj2) => {
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        this._onContactEnter(index1, index2);
      },
      onContactEnd: (obj1, obj2) => {
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        this._onContactExit(index1, index2);
      },
      onContactPersist: (obj1, obj2) => {
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        this._onContactStay(index1, index2);
      },
      onTriggerBegin: (obj1, obj2) => {
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        const event = index1 < index2 ? this._getTrigger(index1, index2) : this._getTrigger(index2, index1);
        event.state = TriggerEventState.Enter;
        this._currentEvents.add(event);
      },
      onTriggerEnd: (obj1, obj2) => {
        const index1 = obj1.getQueryFilterData().word0;
        const index2 = obj2.getQueryFilterData().word0;
        let event: TriggerEvent;
        if (index1 < index2) {
          const subMap = this._eventMap[index1];
          event = subMap[index2];
          subMap[index2] = undefined;
        } else {
          const subMap = this._eventMap[index2];
          event = subMap[index1];
          subMap[index1] = undefined;
        }
        event.state = TriggerEventState.Exit;
      }
    };

    const PHYSXSimulationCallbackInstance = PhysXPhysics._physX.PxSimulationEventCallback.implement(triggerCallback);
    const sceneDesc = PhysXPhysics._physX.getDefaultSceneDesc(
      PhysXPhysics._pxPhysics.getTolerancesScale(),
      0,
      PHYSXSimulationCallbackInstance
    );
    this._pxScene = PhysXPhysics._pxPhysics.createScene(sceneDesc);
  }

  /**
   * {@inheritDoc IPhysicsManager.setGravity }
   */
  setGravity(value: Vector3) {
    this._pxScene.setGravity(value);
  }

  /**
   * {@inheritDoc IPhysicsManager.addColliderShape }
   */
  addColliderShape(colliderShape: PhysXColliderShape) {
    this._eventMap[colliderShape._id] = {};
  }

  /**
   * {@inheritDoc IPhysicsManager.removeColliderShape }
   */
  removeColliderShape(colliderShape: PhysXColliderShape) {
    const { _eventPool: eventPool, _currentEvents: currentEvents } = this;
    const { _id: shapeID } = colliderShape;
    for (let i = currentEvents.length - 1; i >= 0; i--) {
      const event = currentEvents.get(i);
      if (event.index1 == shapeID || event.index2 == shapeID) {
        currentEvents.deleteByIndex(i);
        eventPool.push(event);
      }
    }
    delete this._eventMap[shapeID];
  }

  /**
   * {@inheritDoc IPhysicsManager.addCollider }
   */
  addCollider(collider: PhysXCollider): void {
    this._pxScene.addActor(collider._pxActor, null);
  }

  /**
   * {@inheritDoc IPhysicsManager.removeCollider }
   */
  removeCollider(collider: PhysXCollider): void {
    this._pxScene.removeActor(collider._pxActor, true);
  }

  /**
   * {@inheritDoc IPhysicsManager.addCharacterController }
   */
  addCharacterController(characterController: PhysXCharacterController): void {
    const lastPXManager = characterController._pxManager;
    const shape = characterController._shape;
    if (shape) {
      if (lastPXManager !== this) {
        lastPXManager && characterController._destroyPXController();
        characterController._createPXController(this, shape);
      }
      this._pxScene.addController(characterController._pxController);
    }
    characterController._pxManager = this;
  }

  /**
   * {@inheritDoc IPhysicsManager.removeCharacterController }
   */
  removeCharacterController(characterController: PhysXCharacterController): void {
    if (characterController._shape) {
      this._pxScene.removeController(characterController._pxController);
    }
    characterController._pxManager = null;
  }

  /**
   * {@inheritDoc IPhysicsManager.update }
   */
  update(elapsedTime: number): void {
    this._simulate(elapsedTime);
    this._fetchResults();
    this._fireEvent();
  }

  /**
   * {@inheritDoc IPhysicsManager.raycast }
   */
  raycast(
    ray: Ray,
    distance: number,
    onRaycast: (obj: number) => boolean,
    hit?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean {
    const { _pxRaycastHit: pxHitResult } = PhysXPhysicsManager;
    distance = Math.min(distance, 3.4e38); // float32 max value limit in physx raycast.

    const raycastCallback = {
      preFilter: (filterData, shape, actor) => {
        const index = shape.getQueryFilterData().word0;
        if (onRaycast(index)) {
          return 2; // eBLOCK
        } else {
          return 0; // eNONE
        }
      },
      postFilter: (filterData, hit) => {}
    };

    const result = this._pxScene.raycastSingle(
      ray.origin,
      ray.direction,
      distance,
      pxHitResult,
      PhysXPhysicsManager._pxFilterData,
      PhysXPhysics._physX.PxQueryFilterCallback.implement(raycastCallback)
    );

    if (result && hit != undefined) {
      const { _tempPosition: position, _tempNormal: normal } = PhysXPhysicsManager;
      const { position: pxPosition, normal: pxNormal } = pxHitResult;
      position.set(pxPosition.x, pxPosition.y, pxPosition.z);
      normal.set(pxNormal.x, pxNormal.y, pxNormal.z);

      hit(pxHitResult.getShape().getQueryFilterData().word0, pxHitResult.distance, position, normal);
    }
    return result;
  }

  /**
   * @internal
   */
  _getControllerManager(): any {
    let pxControllerManager = this._pxControllerManager;
    if (pxControllerManager === null) {
      this._pxControllerManager = pxControllerManager = this._pxScene.createControllerManager();
    }
    return pxControllerManager;
  }

  private _simulate(elapsedTime: number): void {
    this._pxScene.simulate(elapsedTime, true);
  }

  private _fetchResults(block: boolean = true): void {
    this._pxScene.fetchResults(block);
  }

  private _getTrigger(index1: number, index2: number): TriggerEvent {
    let event: TriggerEvent;
    if (this._eventPool.length) {
      event = this._eventPool.pop();
      event.index1 = index1;
      event.index2 = index2;
    } else {
      event = new TriggerEvent(index1, index2);
    }
    this._eventMap[index1][index2] = event;
    return event;
  }

  private _fireEvent(): void {
    const { _eventPool: eventPool, _currentEvents: currentEvents } = this;
    for (let i = currentEvents.length - 1; i >= 0; i--) {
      const event = currentEvents.get(i);
      if (event.state == TriggerEventState.Enter) {
        this._onTriggerEnter(event.index1, event.index2);
        event.state = TriggerEventState.Stay;
      } else if (event.state == TriggerEventState.Stay) {
        this._onTriggerStay(event.index1, event.index2);
      } else if (event.state == TriggerEventState.Exit) {
        this._onTriggerExit(event.index1, event.index2);
        currentEvents.deleteByIndex(i);
        eventPool.push(event);
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
  PRE_FILTER = 1 << 2,
  POST_FILTER = 1 << 3,
  ANY_HIT = 1 << 4,
  NO_BLOCK = 1 << 5
}

/**
 * Physics state
 */
enum TriggerEventState {
  Enter,
  Stay,
  Exit
}

/**
 * Trigger event to store interactive object ids and state.
 */
class TriggerEvent {
  state: TriggerEventState;
  index1: number;
  index2: number;

  constructor(index1: number, index2: number) {
    this.index1 = index1;
    this.index2 = index2;
  }
}
