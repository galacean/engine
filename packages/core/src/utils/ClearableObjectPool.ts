import { IPoolElement, ObjectPool } from "./ObjectPool";

/**
 * Clearable Object Pool.
 */
export class ClearableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _usedElementCount: number = 0;

  constructor(type: new () => T, initializeCount: number = 0) {
    super(type, initializeCount);
  }

  /**
   * Get an object.
   */
  get(): T {
    const { _usedElementCount: usedElementCount, _elements: elements } = this;
    this._usedElementCount++;
    if (elements.length === usedElementCount) {
      const element = new this._type();
      elements.push(element);
      return element;
    } else {
      return elements[usedElementCount];
    }
  }

  /**
   * Clear used object count to 0, not destroy any object, just change index.
   */
  clear(): void {
    this._usedElementCount = 0;
  }
}
