import { Vector3 } from "@galacean/engine-math";
import { Entity } from "../../Entity";
import { IPoolElement } from "../../utils/ObjectPool";
import { Pointer } from "./Pointer";

/**
 * Pointer event data.
 */
export class PointerEventData implements IPoolElement {
  /** The entity that listens to this event. */
  target: Entity;
  /** The entity currently handling this event. */
  currentTarget: Entity;
  /** The pointer that triggers this event. */
  pointer: Pointer;
  /** The position of the event trigger (in world space). */
  position: Vector3 = new Vector3();

  dispose() {
    this.pointer = this.target = this.currentTarget = null;
  }
}
