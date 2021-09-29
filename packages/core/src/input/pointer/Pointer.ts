import { Vector2 } from "@oasis-engine/math";
import { PointerPhase } from "../enums/PointerPhase";

/**
 * Pointer.
 */
export class Pointer {
  /**
   * Unique id.
   * @remark Start from 0.
   */
  readonly id: number;
  /** The phase of pointer. */
  phase: PointerPhase = PointerPhase.Leave;
  /** The position of the pointer in screen space pixel coordinates. */
  position: Vector2 = new Vector2();

  /** @internal */
  _uniqueID: number;
  /** @internal */
  _needUpdate: boolean = true;

  /**
   * @internal
   */
  constructor(id: number) {
    this.id = id;
  }
}
