import { IPoolElement } from "@galacean/engine";

export class TempArray<T> implements IPoolElement {
  array: Array<T> = new Array();

  dispose(): void {
    this.array.length = 0;
  }
}
