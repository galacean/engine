// Local copy of engine-core's object pool so the parser carries no engine-core runtime dependency.

export interface IPoolElement {
  dispose?(): void;
}

export abstract class ObjectPool<T extends IPoolElement> {
  protected _type: new () => T;
  protected _elements: T[];

  constructor(type: new () => T) {
    this._type = type;
  }

  abstract get(): T;
}

export class ClearableObjectPool<T extends IPoolElement> extends ObjectPool<T> {
  private _usedElementCount: number = 0;

  constructor(type: new () => T) {
    super(type);
    this._elements = [];
  }

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

  clear(): void {
    this._usedElementCount = 0;
  }
}
