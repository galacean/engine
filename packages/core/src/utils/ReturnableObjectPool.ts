import { IPoolElement, ObjectPool } from "./ObjectPool";

/**
 * Returnable Object Pool.
 */
export class ReturnableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  constructor(type: new () => T, initializeCount: number = 1) {
    super(type);
    const elements = (this._elements = new Array<T>(initializeCount));
    for (let i = 0; i < initializeCount; ++i) {
      elements[i] = new type();
    }
  }

  /**
   * Get an object from the pool.
   */
  get(): T {
    return this._elements.pop() ?? new this._type();
  }

  /**
   * Return an object to the pool.
   * The caller must stop using the object and return it only once.
   */
  return(element: T): void {
    this._elements.push(element);
  }
}
