import { Vector2 } from "@oasis-engine/math";

/**
 * Pointer.
 */
export class Pointer {
  pointerId: number;
  type: string;
  timeStamp: number;
  phase: PointerPhase = PointerPhase.Leave;
  /** The position of the pointer in screen space pixel coordinates. */
  position: Vector2 = new Vector2();

  /**
   * Constructor a Pointer.
   * @param id - The id for the pointer
   */
  constructor(public id: number) {}
}

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
