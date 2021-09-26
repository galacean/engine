import { Vector2 } from "@oasis-engine/math";
import { PointerPhase } from "../enums/PointerPhase";
import { PointerType } from "../enums/PointerType";

/**
 * Pointer.
 */
export class Pointer {
  /** UniqueID of PointerEvent. */
  uniqueID: number;
  pointerType: PointerType;
  /** Timestamp of the most recent phase change. */
  timeStamp: number;
  /** Recent phase. */
  phase: PointerPhase = PointerPhase.Leave;
  /** The position of the pointer in screen space pixel coordinates. */
  position: Vector2 = new Vector2();

  /**
   * Constructor a Pointer.
   * @param id - The id for the pointer, start from 0 and automatically fill in.
   */
  constructor(public id: number) {}
}
