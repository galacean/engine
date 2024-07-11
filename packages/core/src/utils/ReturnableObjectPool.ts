import { IPoolElement, ObjectPool } from "./ObjectPool";

/**
 * Returnable Object Pool.
 */
export class ReturnableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _lastElementIndex: number;

  constructor(type: new () => T, initializeCount: number = 1) {
    super(type, initializeCount);
    this._lastElementIndex = initializeCount - 1;
  }

  /**
   * Get an object from the pool.
   */
  get(): T {
    if (this._lastElementIndex < 0) {
      return new this._type();
    }
    const ret = this._elements[this._lastElementIndex--];
    this._elements.length -= 1;
    return ret;
  }

  /**
   * Return an object to the pool.
   */
  return(element: T): void {
    this._elements[++this._lastElementIndex] = element;
  }
}
