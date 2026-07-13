export class ClearablePool<T> {
  private _type: new () => T;
  private _elements: T[];
  private _usedElementCount: number = 0;

  constructor(type: new () => T) {
    this._type = type;
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
