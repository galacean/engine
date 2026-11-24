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
  readonly state: PhysicsEventState;
}

/**
 * A buffered trigger event from the physics backend.
 */
export interface ITriggerEvent {
  readonly shape0Id: number;
  readonly shape1Id: number;
  readonly state: PhysicsEventState;
}

/**
 * Borrowed event buffers for dispatch after a simulation step.
 * @remarks Consume event records and contact points before the next scene update or event collection.
 */
export interface IPhysicsEvents {
  readonly contactEvents: ReadonlyArray<IContactEvent>;
  /** The number of valid records at the start of the contact event buffer. */
  readonly contactEventCount: number;
  readonly triggerEvents: ReadonlyArray<ITriggerEvent>;
}
