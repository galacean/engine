import { ICollision } from "./ICollision";

/** The phase of a buffered collision or trigger event. */
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
  /** The state snapshot for dispatch. */
  dispatchState: PhysicsEventState;
}

/**
 * Physics events returned by IPhysicsScene.updateEvents().
 */
export interface IPhysicsEvents {
  contactEvents: ReadonlyArray<IContactEvent>;
  contactEventCount: number;
  triggerEvents: ReadonlyArray<ITriggerEvent>;
}
