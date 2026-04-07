import { Engine } from "../Engine";
import { InstanceDataPacker } from "./InstanceDataPacker";

/**
 * @internal
 */
export class InstanceDataPackerPool {
  private _engine: Engine;
  private _pool = new Array<InstanceDataPacker>();
  private _poolIndex = 0;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  getOrCreate(): InstanceDataPacker {
    return (this._pool[this._poolIndex++] ||= new InstanceDataPacker(this._engine));
  }

  uploadBuffer(): void {
    const pool = this._pool;
    for (let i = 0, n = this._poolIndex; i < n; i++) {
      const batch = pool[i];
      if (batch.instanceCount > 1) {
        batch.prepare();
      }
    }
  }

  reset(): void {
    const pool = this._pool;
    for (let i = 0, n = this._poolIndex; i < n; i++) {
      pool[i].reset();
    }
    this._poolIndex = 0;
  }

  destroy(): void {
    const pool = this._pool;
    for (let i = 0, n = pool.length; i < n; i++) {
      pool[i].destroy();
    }
  }
}
