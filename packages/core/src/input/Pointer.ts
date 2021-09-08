/**
 * Pointer.
 */
export class Pointer {
  /** The pageX of the pointer. */
  pageX: number;
  /** The pageY of the pointer. */
  pageY: number;
  /** The pointerId of the pointer. */
  pointerId: number = -1;
  /** The index of the pointer in pointerList. */
  indexInList: number = -1;

  /**
   * Constructor a Pointer.
   * @param pointerId - The pageX of the pointer
   * @param pageX - The pageY of the pointer
   * @param pageY - The pointerId of the pointer
   * @param indexInList - The index of the pointer in pointerList
   */
  constructor(pointerId: number, pageX: number, pageY: number, indexInList: number) {
    this.pointerId = pointerId;
    this.pageX = pageX;
    this.pageY = pageY;
    this.indexInList = indexInList;
  }
}
