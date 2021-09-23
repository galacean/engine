import { Vector2 } from "@oasis-engine/math";

export enum PointerPhase {
  /** A Pointer pressed on the screen. */
  Down,
  /** A pointer moved on the screen. */
  Move,
  /** A pointer was lifted from the screen. */
  Up,
  /** The system cancelled tracking for the pointer. */
  Leave
}

/**
 * Pointer.
 */
export class Pointer {
  /** PointerId of PointerEvent. */
  pointerId: number;
  pointerType: string;
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
