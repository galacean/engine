import { IPoolElement } from "@galacean/engine";

type Constructor<T> = new (...args: any[]) => T;

export interface IInitializedPoolElement<T, C extends Constructor<T>> {
  init(...args: ConstructorParameters<C>): void;
}

export const AstNodePoolSet: AstNodePool<any, any>[] = [];
export function clearAllAstNodePool() {
  for (let i = 0; i < AstNodePoolSet.length; i++) {
    AstNodePoolSet[i].clear();
  }
}

export class AstNodePool<C extends Constructor<T>, T extends IPoolElement & IInitializedPoolElement<T, C>> {
  private _type: C;
  private _elements: T[];
  private _usedElementCount: number = -1;

  constructor(type: C, initializeCount: number) {
    this._type = type;
    this._elements = new Array<T>(initializeCount);
    for (let i = 0; i < initializeCount; i++) {
      this._elements[i] = new type();
    }
    AstNodePoolSet.push(this);
  }

  garbageCollection(): void {
    const elements = this._elements;
    for (let i = elements.length - 1; i >= 0; i--) {
      elements[i]?.dispose();
    }
    elements.length = 0;
  }

  get(...args: ConstructorParameters<C>): T {
    this._usedElementCount++;
    let element: T;
    if (this._elements.length === this._usedElementCount) {
      element = new this._type(...args);
      this._elements.push(element);
    } else {
      element = this._elements[this._usedElementCount];
    }
    element.init(...args);
    return element;
  }

  clear(): void {
    this._usedElementCount = -1;
  }
}
