import { IPoolElement } from "../utils/ObjectPool";

/**
 * @internal
 */
export class Area implements IPoolElement {
  constructor(
    public start?: number,
    public size?: number
  ) {}

  dispose?(): void {}
}
