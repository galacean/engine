/**
 * @internal
 */
export class CharRenderDataPool<T> {
  private _elements: T[] = [];
  private _type: new () => T;

  constructor(type: new () => T, length: number) {
    this._type = type;
    const elements = this._elements;
    for (let i = 0; i < length; ++i) {
      elements[i] = new type();
    }
  }

  get(): T {
    if (this._elements.length > 0) {
      return this._elements.pop();
    }
    return new this._type();
  }

  put(data: T): void {
    this._elements.push(data);
  }
}
