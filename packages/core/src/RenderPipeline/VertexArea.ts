import { IPoolElement } from "../utils/ObjectPool";

/**
 * @internal
 */
export class VertexArea implements IPoolElement {
  start: number;
  size: number;

  constructor(start?: number, size?: number) {
    this.start = start!;
    this.size = size!;
  }

  dispose?(): void {}
}
