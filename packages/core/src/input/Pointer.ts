/**
 * Pointer.
 */
export class Pointer {
  /**
   * Constructor a Pointer.
   * @param pointerId - The pageX of the pointer
   * @param pageX - The pageY of the pointer
   * @param pageY - The pointerId of the pointer
   * @param indexInList - The index of the pointer in pointerList
   */
  constructor(public pointerId: number, public pageX: number, public pageY: number, public indexInList: number) {
    this.pointerId = pointerId;
    this.pageX = pageX;
    this.pageY = pageY;
    this.indexInList = indexInList;
  }
}
