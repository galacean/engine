import { IPoolElement, ObjectPool } from "./ObjectPool";

/**
 * Clearable Object Pool.
 */
export class ClearableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _usedElementCount: number = 0;

  constructor(type: new () => T) {
    super(type);
    this._elements = [];
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

  /**
   * Dispose the used objects to release the external references they hold, then reset the used count.
   * @remarks Unlike `clear`, this lets each used element drop its references, so a peak-usage frame
   * does not keep dangling references alive in slots that later frames don't reuse.
   */
  disposeUsedElements(): void {
    const { _elements: elements, _usedElementCount: usedElementCount } = this;
    for (let i = 0; i < usedElementCount; i++) {
      elements[i].dispose?.();
    }
    this._usedElementCount = 0;
  }
}
