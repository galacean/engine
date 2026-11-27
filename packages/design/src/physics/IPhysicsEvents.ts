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
 * @remarks Reuse the same record across simulation steps until the overlap ends.
 */
export interface ITriggerEvent {
  readonly shape0Id: number;
  readonly shape1Id: number;
  readonly state: PhysicsEventState;

  /** @internal Previous dispatch receiver for shape0Id. Cleared when the pair retires. */
  _receiver0?: unknown;
  /** @internal Previous dispatch receiver for shape1Id. Cleared when the pair retires. */
  _receiver1?: unknown;
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
