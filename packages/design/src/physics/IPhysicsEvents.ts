import { ICollision } from "./ICollision";

/**
 * The state of a physics event.
 */
export enum PhysicsEventState {
  Enter,
  Stay,
  Exit
}

/**
 * A buffered contact event from the physics backend.
 */
export interface IContactEvent extends ICollision {
  state: PhysicsEventState;
}

/**
 * A buffered trigger event from the physics backend.
 */
export interface ITriggerEvent {
  index1: number;
  index2: number;
  state: PhysicsEventState;
}

/**
 * Physics events returned by IPhysicsScene.fireEvents().
 */
export interface IPhysicsEvents {
  contactEvents: ReadonlyArray<IContactEvent>;
  triggerEvents: ReadonlyArray<ITriggerEvent>;
}
