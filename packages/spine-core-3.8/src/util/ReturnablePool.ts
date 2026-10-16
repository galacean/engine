export class ReturnablePool<T> {
  private _type: new () => T;
  private _elements: T[];
  private _lastElementIndex: number;

  constructor(type: new () => T, initializeCount: number = 1) {
    this._type = type;
    this._lastElementIndex = initializeCount - 1;
    const elements = (this._elements = new Array<T>(initializeCount));
    for (let i = 0; i < initializeCount; ++i) {
      elements[i] = new type();
    }
  }

  get(): T {
    if (this._lastElementIndex < 0) {
      return new this._type();
    }
    return this._elements[this._lastElementIndex--];
  }

  return(element: T): void {
    this._elements[++this._lastElementIndex] = element;
  }
}
