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
  /** The event phase captured when the scene collects events for dispatch. */
  dispatchState: PhysicsEventState;
}

/**
 * Borrowed event buffers for dispatch after a simulation step.
 * @remarks Consume event records and contact points before the next scene update or event collection.
 */
export interface IPhysicsEvents {
  contactEvents: ReadonlyArray<IContactEvent>;
  /** The number of valid records at the start of the contact event buffer. */
  contactEventCount: number;
  triggerEvents: ReadonlyArray<ITriggerEvent>;
}
