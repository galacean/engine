import { ICollision } from "./ICollision";

/**
 * A buffered contact event from the physics backend.
 */
export interface IContactEvent extends ICollision {
  /** 0 = Enter, 1 = Stay, 2 = Exit */
  state: number;
}

/**
 * A buffered trigger event from the physics backend.
 */
export interface ITriggerEvent {
  index1: number;
  index2: number;
  /** 0 = Enter, 1 = Stay, 2 = Exit */
  state: number;
}

/**
 * Physics events returned by IPhysicsScene.fireEvents().
 */
export interface IPhysicsEvents {
  contactEvents: ReadonlyArray<IContactEvent>;
  triggerEvents: ReadonlyArray<ITriggerEvent>;
}
