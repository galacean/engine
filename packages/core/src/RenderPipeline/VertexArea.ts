import { IPoolElement } from "../utils/ObjectPool";

/**
 * @internal
 */
export class VertexArea implements IPoolElement {
  constructor(
    public start?: number,
    public size?: number
  ) {}

  dispose?(): void {}
}
