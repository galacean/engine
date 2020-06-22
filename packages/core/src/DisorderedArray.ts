/**
 * @internal
 * 高性能无序数组，delete采用交换法提升行,内部数只扩不缩。
 */
export class DisorderedArray<T> {
  _elements: T[];

  length: number = 0;

  constructor(count: number = 0) {
    this._elements = new Array<T>(count);
  }

  add(element: T): void {
    if (this.length === this._elements.length) this._elements.push(element);
    else this._elements[this.length] = element;
    this.length++;
  }

  delete(element: T): void {
    const index = this._elements.indexOf(element); //CM:可修改为自定义二分查找等算法,目前this._elements>=this.length 浪费性能
    this.deleteByIndex(index);
  }
  /**
   *
   * @param index
   * @returns 被替换过来的项 用于外部重置他的index
   */
  deleteByIndex(index: number): T {
    var elements: T[] = this._elements;
    let end: T = null;
    const lastIndex = this.length - 1;
    if (index !== lastIndex) {
      end = elements[lastIndex];
      elements[index] = end;
    }
    this.length--;
    return end;
  }

  garbageCollection(): void {
    this._elements.length = this.length;
  }
}
