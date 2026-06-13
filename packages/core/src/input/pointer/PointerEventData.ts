import { Vector3 } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { IPoolElement } from "../../utils/ObjectPool";
import { Pointer } from "./Pointer";

/**
 * Pointer event data.
 */
export class PointerEventData implements IPoolElement {
  /** The pointer that triggers this event. */
  pointer: Pointer;
  /** The position of the event trigger (in world space). */
  worldPosition: Vector3 = new Vector3();
  /** The hit-tested target entity (deepest entity on the bubble path). */
  target: Entity = null;
  /** The entity currently handling the event (same as target on non-bubbling fire, varies on bubble). */
  currentTarget: Entity = null;

  /**
   * @internal
   */
  dispose() {
    this.pointer = null;
    this.target = null;
    this.currentTarget = null;
  }
}
