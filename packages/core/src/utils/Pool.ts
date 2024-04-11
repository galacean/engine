export interface IPoolElement {
  dispose?(): void;
}

export class Pool<T extends IPoolElement> {
  private _type: new () => T;
  private _elementPool: T[] = [];
  private _elementPoolIndex: number;

  constructor(type: new () => T, count: number = 1) {
    this._type = type;
    this._elementPoolIndex = count - 1;
    const { _elementPool } = this;
    for (let i = 0; i < count; ++i) {
      _elementPool.push(new type());
    }
  }

  alloc(): T {
    if (this._elementPoolIndex < 0) {
      return new this._type();
    }
    return this._elementPool[this._elementPoolIndex--];
  }

  free(element: T): void {
    this._elementPool[++this._elementPoolIndex] = element;
  }

  dispose(): void {
    const { _elementPool: pool } = this;
    for (let i = pool.length - 1; i >= 0; i--) {
      pool[i].dispose && pool[i].dispose();
    }
    pool.length = 0;
  }
}
