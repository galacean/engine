import { IClone } from "@galacean/engine-design";
import { ParticleCurve } from "./ParticleCurve";

/**
 * A burst is a particle emission event, where a number of particles are all emitted at the same time
 */
export class Burst implements IClone {
  private _time: number;
  private _count: ParticleCurve;

  /**
   * The time that each burst occurs.
   */
  get time(): number {
    return this._time;
  }

  /**
   * The number of particles to emit.
   */
  get count(): ParticleCurve {
    return this._count;
  }

  /**
   * Create burst object.
   * @param time - Time to emit the burst.
   * @param count - Minimum number of particles to emit.
   */
  constructor(time: number, count: ParticleCurve) {
    this._time = time;
    this._count = count;
  }

  /**
   * clone to
   * @param  destBurst - The dest
   */
  cloneTo(destBurst: Burst): void {
    destBurst._time = this._time;
    destBurst._count = this.count;
  }

  /**
   * clone
   * @return The copy
   */
  clone(): Burst {
    const destBurst: Burst = new Burst(this._time, this._count);
    this.cloneTo(destBurst);
    return destBurst;
  }
}
