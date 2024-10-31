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
 * The basic interface for Object Pool's element.
 */
export interface IPoolElement {
  /**
   * Called when the object need be release.
   */
  dispose?(): void;
}
