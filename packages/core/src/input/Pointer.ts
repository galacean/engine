import { Vector2 } from "@oasis-engine/math";

/**
 * Pointer.
 */
export class Pointer {
  /** The position of the pointer in screen space pixel coordinates. */
  position: Vector2 = new Vector2();
  /** @internal */
  _indexInList: number;

  /**
   * Constructor a Pointer.
   * @param id - The unique identifier for the pointer
   * @param x - The x coordinate of the pointer
   * @param y - The y coordinate of the pointer
   * @param indexInList - The index of the pointer in pointerList
   */
  constructor(public id: number, x: number, y: number, indexInList: number) {
    this.position.setValue(x, y);
    this._indexInList = indexInList;
  }
}
