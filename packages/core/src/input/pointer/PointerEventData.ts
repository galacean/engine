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
  /** The pointer that triggers this event. */
  pointer: Pointer;
  /** The position of the event trigger (in world space). */
  worldPosition: Vector3 = new Vector3();

  /**
   * @internal
   */
  dispose() {
    this.pointer = this.target = null;
  }
}
