// Local copy — keep behavior in lockstep with `packages/core/src/utils/ObjectPool.ts`,
// `ClearableObjectPool.ts` and `ReturnableObjectPool.ts`. shader-compiler is
// standalone (see ../enums/README.md) so it does not import engine-core.

/**
 * The basic interface for Object Pool's element.
 */
export interface IPoolElement {
  /**
   * Called when the object need be release.
   */
  dispose?(): void;
}

export abstract class ObjectPool<T extends IPoolElement> {
  protected _type: new () => T;
  protected _elements: T[];

  constructor(type: new () => T) {
    this._type = type;
  }

  garbageCollection(): void {
    const elements = this._elements;
    for (let i = elements.length - 1; i >= 0; i--) {
      elements[i].dispose && elements[i].dispose();
    }
    elements.length = 0;
  }

  abstract get(): T;
}

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
}

/**
 * Returnable Object Pool.
 */
export class ReturnableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _lastElementIndex: number;

  constructor(type: new () => T, initializeCount: number = 1) {
    super(type);
    this._lastElementIndex = initializeCount - 1;
    const elements = (this._elements = new Array<T>(initializeCount));
    for (let i = 0; i < initializeCount; ++i) {
      elements[i] = new type();
    }
  }

  /**
   * Get an object from the pool.
   */
  get(): T {
    if (this._lastElementIndex < 0) {
      return new this._type();
    }
    return this._elements[this._lastElementIndex--];
  }

  /**
   * Return an object to the pool.
   */
  return(element: T): void {
    this._elements[++this._lastElementIndex] = element;
  }
}
